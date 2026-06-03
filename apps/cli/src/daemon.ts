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

  function handleHook(payload: HookPayload): void {
    const session = payload.session_id ?? "default";
    switch (payload.hook_event_name) {
      case "UserPromptSubmit": {
        // Appraise locally. The text is used here and discarded; only numbers persist.
        lastAppraisal.set(session, appraisePrompt(payload.prompt ?? ""));
        return;
      }
      case "Stop": {
        const { tokens } = readTokenUsage(payload.transcript_path);
        const appraisal = lastAppraisal.get(session) ?? appraisePrompt("");
        lastAppraisal.delete(session);
        enqueue({
          type: "feed",
          source: SOURCE,
          payload: { appraisal, tokens, linesAuthored: 0 }, // TODO: derive linesAuthored
          clientEventId: randomUUID(),
          clientAt: Date.now(),
        });
        return;
      }
      default:
        return; // ignore other hook events
    }
  }

  async function flush(): Promise<void> {
    const token = readToken(); // shared store is the source of truth — read fresh each tick
    if (!token) return; // no identity yet — keep events durable until someone signs in
    const items = readOutbox();
    if (items.length === 0) return;

    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);

    const remaining: typeof items = [];
    for (const item of items) {
      try {
        await client.mutation(ingestEvent, item);
        // success (accepted or rejected-but-processed) → drop; dedup makes retries safe
      } catch {
        remaining.push(item); // network/auth error — keep for next tick
      }
    }
    writeOutbox(remaining);
  }

  const server = createServer((req, res) => {
    // Shared token read — the app and `agent-idle login` poll this off the shared store.
    if (req.method === "GET" && req.url === "/token") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: readToken() }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    void readBody(req).then((body) => {
      try {
        if (req.url === "/auth-token") {
          // The app pushes its Convex Auth token here → shared store (used by all surfaces).
          const { token: t } = JSON.parse(body || "{}") as { token?: string };
          if (t) writeToken(t);
        } else if (req.url === "/hook") {
          handleHook(JSON.parse(body || "{}") as HookPayload);
        }
      } catch {
        /* swallow — never let a bad payload crash the sensor */
      }
      res.writeHead(204).end();
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
