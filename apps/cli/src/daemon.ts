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
import { type Agent, DAEMON_PORT, DEFAULT_CONVEX_URL, SOURCES, parseAgent, readToken, writeToken } from "./config.js";
import { enqueue, readOutbox, writeOutbox } from "./outbox.js";
import { readTokenUsage } from "./transcript.js";

const FLUSH_INTERVAL_MS = 5_000;
// Re-send a "working" signal at most this often per session (well under the engine's
// workTimeoutMs so an active turn keeps mining, but rare enough not to flood).
const RENEW_MS = 12_000;

// Opt-in debug logging. Off by default (the sensor is quiet in production); the dev
// daemon (`pnpm dev`) sets AGENT_IDLE_DEBUG=1 so you can watch the hook→flush pipeline.
const DEBUG = Boolean(process.env.AGENT_IDLE_DEBUG);
function debug(...args: unknown[]): void {
  if (DEBUG) console.log("[agent-idle]", ...args);
}
/** Short session tag for readable logs. */
const tag = (s: string): string => s.slice(0, 8);

/** Last path segment of the working dir = the repo/folder name. Local-only display hint. */
function repoFromCwd(cwd?: string): string {
  if (!cwd) return "";
  const parts = cwd.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

// Low-signal words to skip when guessing a one-word topic from the first prompt.
const TOPIC_STOP = new Set([
  "the", "a", "an", "to", "of", "and", "or", "for", "in", "on", "with", "my", "our", "your",
  "please", "pls", "can", "could", "would", "should", "i", "we", "it", "this", "that", "these",
  "is", "are", "be", "do", "make", "add", "fix", "update", "create", "change", "how", "what",
  "when", "why", "help", "need", "want", "get", "set", "use", "using", "into", "from", "so",
  "also", "just", "new", "some", "any", "through", "look", "about", "like", "have", "has",
]);

/** A single coarse topic word from the FIRST prompt — the longest meaningful token. Stays
 * on this machine (served over loopback only); never sent to the server. */
function topicWord(prompt: string): string {
  const words = (prompt ?? "").toLowerCase().match(/[a-z][a-z0-9+_-]{2,}/g) ?? [];
  const meaningful = words.filter((w) => !TOPIC_STOP.has(w));
  const pool = meaningful.length > 0 ? meaningful : words;
  return pool.reduce((best, w) => (w.length > best.length ? w : best), "");
}

// Reference the Convex mutation by name so the CLI stays decoupled from the generated
// api types (which are authored for a bundler, not NodeNext). The arg shape is our
// IngestArgs; the server validates it.
const ingestEvent = makeFunctionReference<"mutation">("events:ingestEvent");

/** Hook payload (the fields we use) — Claude Code and Codex share these names. */
interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  prompt?: string;
  transcript_path?: string;
  /** Working directory of the agent session — used only for a LOCAL repo-name display hint. */
  cwd?: string;
  /** Name of the tool being used (PreToolUse/PostToolUse). A category only — used for a
   * LOCAL "what kind of work" hint; never enqueued or sent to the server. */
  tool_name?: string;
}

/** Classify a tool name into a coarse work kind (drives the pet's zone in the app). A
 * category derived from the tool NAME only — no prompt/code text. Matches the app's
 * compositor WorkKind union. */
function workKindForTool(tool?: string): string {
  const t = (tool ?? "").toLowerCase();
  if (/edit|write|notebook/.test(t)) return "edit"; // Edit/Write/MultiEdit/NotebookEdit
  if (/web|fetch|search/.test(t)) return "web"; // WebFetch/WebSearch (Grep/Glob caught below)
  if (/read|grep|glob|^ls$|list/.test(t)) return "read"; // reading/searching the codebase
  if (/bash|shell|exec|kill|run/.test(t)) return "run"; // running commands
  return "think"; // Task / MCP / anything else → generic "working"
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
  // Last time we sent a "working" signal per session — throttles renewals so a
  // tool-heavy turn doesn't flood the server.
  const workingSentAt = new Map<string, number>();
  // LOCAL-ONLY per-session display hints (repo folder + one-word topic from the first
  // prompt). Served over loopback to the app; NEVER enqueued or sent to Convex.
  const sessionMeta = new Map<string, { repo: string; topic: string; work: string }>();
  // Guard so the immediate (post-enqueue) flush and the periodic tick don't overlap.
  let flushing = false;

  function emit(session: string, agent: Agent, payload: Record<string, unknown>): void {
    enqueue({
      type: "activity",
      sessionId: session,
      source: SOURCES[agent],
      payload,
      clientEventId: randomUUID(),
      clientAt: Date.now(),
    });
    void flush(); // react immediately, don't wait for the 5s tick
  }

  /** Mark the session working (mining). Renewals are throttled; turn-start forces one. */
  function working(session: string, agent: Agent, force: boolean): void {
    if (!force && Date.now() - (workingSentAt.get(session) ?? 0) < RENEW_MS) return;
    workingSentAt.set(session, Date.now());
    emit(session, agent, { working: true });
  }

  function handleHook(payload: HookPayload, agent: Agent): void {
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
            source: SOURCES[agent],
            payload: {},
            clientEventId: randomUUID(),
            clientAt: Date.now(),
          });
        }
        // Capture LOCAL display hints once, from the first prompt of the session: the repo
        // folder and a one-word topic. Stays in memory here; served only over loopback.
        if (!sessionMeta.has(session)) {
          sessionMeta.set(session, {
            repo: repoFromCwd(payload.cwd),
            topic: topicWord(payload.prompt ?? ""),
            work: "think", // turn started, no tool yet → generic "working"
          });
        } else {
          sessionMeta.get(session)!.work = "think"; // new turn → reset to generic working
        }
        // Appraise locally. The text is used here and discarded; only numbers persist.
        lastAppraisal.set(session, appraisePrompt(payload.prompt ?? ""));
        working(session, agent, true); // turn start → mine now
        debug(`hook UserPromptSubmit agent=${agent} session=${tag(session)} → working`);
        return;
      }
      // Tool activity DURING a turn renews the working window. When the agent stops (turn
      // end OR a Ctrl-C interrupt), these stop firing and the pet lapses to idle.
      case "PreToolUse":
      case "PostToolUse": {
        // Track WHAT the agent is doing (local hint → the pet's zone in the app).
        const m = sessionMeta.get(session);
        if (m) m.work = workKindForTool(payload.tool_name);
        working(session, agent, false);
        return;
      }
      case "Stop": {
        const { tokens } = readTokenUsage(payload.transcript_path, agent);
        const appraisal = lastAppraisal.get(session) ?? appraisePrompt("");
        lastAppraisal.delete(session);
        workingSentAt.delete(session);
        // NB: do NOT clear work here — keep the last kind sticky so the idle pet keeps
        // standing by the activity it was doing (the app shows idle vs active via liveness).

        // Turn END → stop mining now, and credit the turn (quality energy + tokens).
        emit(session, agent, { working: false, appraisal, tokens, linesAuthored: 0 });
        debug(`hook Stop agent=${agent} session=${tag(session)} → idle (tokens=${tokens}, fill=${appraisal.fill})`);
        return;
      }
      default:
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
    // LOCAL-ONLY per-session display hints (repo + topic), keyed by sessionId. The app
    // joins these to its pets for the label. Loopback only — same trust model as /token.
    if (req.method === "GET" && req.url === "/sessions") {
      res.writeHead(200, { ...CORS, "Content-Type": "application/json" });
      res.end(JSON.stringify(Object.fromEntries(sessionMeta)));
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
        } else if (req.url?.startsWith("/hook")) {
          // `?agent=claude|codex` (default claude) selects provenance + transcript parser.
          const agent = parseAgent(new URL(req.url, "http://127.0.0.1").searchParams.get("agent") ?? undefined);
          handleHook(JSON.parse(body || "{}") as HookPayload, agent);
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
