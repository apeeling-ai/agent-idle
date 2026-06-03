/**
 * The headless sensor daemon. A loopback HTTP listener that:
 *  - /auth-token : receives the app's Convex Auth token (the "reuse app token" model),
 *    so the daemon posts events as the SAME authenticated user.
 *  - /hook       : receives Claude Code hook payloads (fire-and-forget from the hook).
 *
 * On the hook events it appraises the prompt LOCALLY (only the numeric quality leaves
 * the machine), reads token counts from the transcript at Stop, builds + enqueues a
 * signed-by-identity event in the durable outbox, and a background flusher posts the
 * outbox to Convex with retry + idempotent clientEventId.
 *
 * HTTP is node's built-in server (loopback only) — no custom socket code.
 */

import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { appraisePrompt, type Appraisal } from "@agent-idle/engine";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { DAEMON_PORT, DEFAULT_CONVEX_URL, SOURCE, readToken, writeToken } from "./config.js";
import { enqueue, readOutbox, writeOutbox } from "./outbox.js";
import { readTokenUsage } from "./transcript.js";

const FLUSH_INTERVAL_MS = 5_000;

// Opt-in debug logging. Off by default (the sensor is quiet in production); the dev
// daemon (`pnpm dev`) sets AGENT_IDLE_DEBUG=1 so you can watch the hook→flush pipeline.
const DEBUG = Boolean(process.env.AGENT_IDLE_DEBUG);
function debug(...args: unknown[]): void {
  if (DEBUG) console.log("[agent-idle]", ...args);
}
/** Short session tag for readable logs. */
const tag = (s: string): string => s.slice(0, 8);

// Reference the Convex mutation by name so the CLI stays decoupled from the generated
// api types (which are authored for a bundler, not NodeNext). The arg shape is our
// IngestArgs; the server validates it.
const ingestEvent = makeFunctionReference<"mutation">("events:ingestEvent");

/** Claude Code hook payload (the fields we use). */
interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  prompt?: string;
  transcript_path?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

export function startDaemon(): void {
  const convexUrl = DEFAULT_CONVEX_URL;
  // Appraisal of the latest prompt, per Claude Code session (kept in memory only).
  const lastAppraisal = new Map<string, Appraisal>();
  // Sessions this process has already registered (server dedups too, by sessionId).
  const registered = new Set<string>();
  // Guard so the immediate (post-enqueue) flush and the periodic tick don't overlap.
  let flushing = false;

  function handleHook(payload: HookPayload): void {
    const session = payload.session_id ?? "default";
    switch (payload.hook_event_name) {
      case "UserPromptSubmit": {
        // First prompt of a session → spawn its pet. Server derives species/name and
        // dedups by sessionId, so re-emitting after a daemon restart is harmless.
        if (!registered.has(session)) {
          registered.add(session);
          enqueue({
            type: "register",
            sessionId: session,
            source: SOURCE,
            payload: {},
            clientEventId: randomUUID(),
            clientAt: Date.now(),
          });
          debug(`hook UserPromptSubmit session=${tag(session)} → register (new pet)`);
        }
        // Appraise locally. The text is used here and discarded; only numbers persist.
        const appraisal = appraisePrompt(payload.prompt ?? "");
        lastAppraisal.set(session, appraisal);
        // Turn START → the pet begins mining (working) until the matching Stop.
        enqueue({
          type: "activity",
          sessionId: session,
          source: SOURCE,
          payload: { working: true }, // no tokens yet; just "now working"
          clientEventId: randomUUID(),
          clientAt: Date.now(),
        });
        debug(`hook UserPromptSubmit session=${tag(session)} → working (quality=${appraisal.quality})`);
        void flush(); // react immediately, don't wait for the 5s tick
        return;
      }
      case "Stop": {
        const { tokens } = readTokenUsage(payload.transcript_path);
        const appraisal = lastAppraisal.get(session) ?? appraisePrompt("");
        lastAppraisal.delete(session);
        // Turn END → stop mining now, and credit the turn (quality energy + tokens).
        enqueue({
          type: "activity",
          sessionId: session,
          source: SOURCE,
          payload: { working: false, appraisal, tokens, linesAuthored: 0 }, // TODO: derive linesAuthored
          clientEventId: randomUUID(),
          clientAt: Date.now(),
        });
        debug(`hook Stop session=${tag(session)} → idle (tokens=${tokens}, fill=${appraisal.fill})`);
        void flush(); // react immediately, don't wait for the 5s tick
        return;
      }
      default:
        debug(`hook ${payload.hook_event_name ?? "?"} session=${tag(session)} (ignored)`);
        return; // ignore other hook events
    }
  }

  async function flush(): Promise<void> {
    if (flushing) return; // a flush is already in flight
    const token = readToken(); // shared store is the source of truth — read fresh each tick
    const items = readOutbox();
    if (items.length === 0) return;
    if (!token) {
      // No identity yet — keep events durable until someone signs in.
      debug(`flush: ${items.length} event(s) queued but no auth token — sign in via the app`);
      return;
    }

    flushing = true;
    try {
      debug(`flush: posting ${items.length} event(s) to ${convexUrl}`);
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(token);

      const remaining: typeof items = [];
      for (const item of items) {
        try {
          const res = await client.mutation(ingestEvent, item);
          // success (accepted or rejected-but-processed) → drop; dedup makes retries safe
          debug(`  ${item.type} session=${tag(item.sessionId)} →`, res);
        } catch (err) {
          remaining.push(item); // network/auth error — keep for next tick
          debug(`  ${item.type} session=${tag(item.sessionId)} FAILED:`, (err as Error)?.message ?? err);
        }
      }
      writeOutbox(remaining);
    } finally {
      flushing = false;
    }
  }

  // The app runs at a different origin (the Vite dev server / Tauri webview) and POSTs
  // its token here with Content-Type: application/json, which makes the browser send a
  // CORS preflight. Answer it (and tag every response) so the loopback bridge isn't
  // silently blocked. Loopback-only, so `*` is fine.
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  } as const;

  const server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS).end(); // CORS preflight
      return;
    }
    // Shared token read — the app and `agent-idle login` poll this off the shared store.
    if (req.method === "GET" && req.url === "/token") {
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: readToken() }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404, CORS).end();
      return;
    }
    void readBody(req).then((body) => {
      try {
        if (req.url === "/auth-token") {
          // The app pushes its Convex Auth token here → shared store (used by all surfaces).
          const { token: t } = JSON.parse(body || "{}") as { token?: string };
          if (t) {
            writeToken(t);
            debug("auth token received from app — will flush as the authenticated user");
          }
        } else if (req.url === "/hook") {
          handleHook(JSON.parse(body || "{}") as HookPayload);
        }
      } catch {
        /* swallow — never let a bad payload crash the sensor */
      }
      res.writeHead(204, CORS).end();
    });
  });

  // If another daemon already holds the port, this one is redundant — exit quietly.
  // (Two near-simultaneous hooks can each try to spawn a daemon.)
  server.on("error", () => process.exit(0));

  server.listen(DAEMON_PORT, "127.0.0.1", () => {
    console.log(`agent-idle daemon listening on http://127.0.0.1:${DAEMON_PORT}`);
    console.log(
      readToken()
        ? "  shared auth token present."
        : "  no auth token yet — sign in via the app or `agent-idle login`.",
    );
  });

  setInterval(() => void flush(), FLUSH_INTERVAL_MS);
}
