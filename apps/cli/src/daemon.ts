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

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { appraisePrompt, type Appraisal, type PetAction } from "@agent-idle/engine";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { type Agent, AUTH_URL, DAEMON_PORT, DEFAULT_CONVEX_URL, SOURCES, parseAgent, readToken, writeToken } from "./config.js";
import { enqueue, readOutbox, writeOutbox } from "./outbox.js";
import { readTokenUsage } from "./transcript.js";

const FLUSH_INTERVAL_MS = 5_000;
// Re-send a "working" signal at most this often per session (well under the engine's
// workTimeoutMs so an active turn keeps mining, but rare enough not to flood).
const RENEW_MS = 12_000;
// How often to poll each tracked session's owning `claude` process for liveness. When the
// process disappears WITHOUT a SessionEnd (terminal closed, SIGKILL, crash), we emit `ended`
// so the pet collapses now instead of waiting out passive decay. Cheap (a `ps` per session).
const LIVENESS_POLL_MS = 5_000;

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
  /** Notification text (permission prompt vs idle wait). Classified LOCALLY to an enum;
   * the text itself is discarded and never leaves the machine. */
  message?: string;
  /** Tool name on PreToolUse/PostToolUse (e.g. "Bash", "Edit"). Classified LOCALLY to a
   * coarse job category — the NAME only, never tool_input (which could carry code/paths). */
  tool_name?: string;
  /** SessionStart cause: "startup" | "resume" | "clear" | "compact" (local debug only). */
  source?: string;
  /** PreCompact cause: "manual" | "auto" (local debug only). */
  trigger?: string;
  /** Terminal/instance name the hook read from its env (AGENT_IDLE_LABEL / TERM_PROGRAM / …).
   * LOCAL display hint only — served over loopback to the app, never sent to Convex. */
  terminal?: string;
  /** PID of the owning `claude` process, resolved by the hook (SessionStart/UserPromptSubmit
   * only). The daemon polls it to detect a hard kill. LOCAL only — never sent to Convex. */
  agentPid?: number;
  /** Start time (ps lstart) of that process — an identity tuple with agentPid that defeats
   * PID reuse: a recycled pid with a different start time reads as a DIFFERENT (gone) process. */
  agentStart?: string;
}

/** Start time (ps `lstart`) of a pid, or "" if it doesn't exist / `ps` is unavailable. Used
 * both to confirm liveness and to detect PID reuse (a changed start time ⇒ not our process). */
function processStart(pid: number): string {
  try {
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 500,
    }).trim();
  } catch {
    return ""; // no such process (or no ps) → treat as gone
  }
}

/**
 * Classify a tool NAME into the pet's job category (which room/animation it works in). Maps
 * on the tool name only — never tool_input — so nothing sensitive is read. Unknown tools
 * (Task, TodoWrite, …) → "none" so the pet keeps its default action rather than flip-flopping.
 */
function classifyToolAction(toolName?: string): PetAction {
  switch (toolName) {
    case "Bash":
    case "BashOutput":
    case "KillShell":
    case "KillBash":
      return "shell";
    case "Edit":
    case "MultiEdit":
    case "Write":
    case "NotebookEdit":
      return "edit";
    case "Read":
    case "Grep":
    case "Glob":
    case "LS":
      return "read";
    case "WebFetch":
    case "WebSearch":
      return "web";
    default:
      return "none";
  }
}

/**
 * Classify a Claude Code Notification LOCALLY into the kind of attention it wants. Only the
 * resulting enum is used — the message text is read here and discarded, never enqueued.
 *   - permission/approval prompt   → "alert"    (exclamation: the agent needs you to act)
 *   - idle "waiting for your input" → "question" (gentle: your turn)
 * Unknown messages default to the softer "question".
 */
function classifyNotification(message?: string): "alert" | "question" {
  const m = (message ?? "").toLowerCase();
  if (m.includes("permission") || m.includes("approve") || m.includes("approval")) return "alert";
  return "question";
}

// Cap request bodies — loopback + Node-only writers means payloads are tiny; anything larger
// is junk, so we refuse it rather than buffer an unbounded amount into memory.
const MAX_BODY_BYTES = 1_000_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve("");
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

/**
 * The loopback bridge is reachable by anything running on the machine, INCLUDING the browser.
 * So we treat it like a security boundary:
 *  - only honor requests addressed to the real loopback host (defeats DNS-rebinding),
 *  - never hand a secret (the auth token) to a browser, and
 *  - refuse cross-site browser callers on the state-changing endpoints (CSRF).
 * Node callers (the hook, the CLI) send NO Origin header and are always allowed; browser
 * callers must come from one of the app's own origins.
 *
 * Browser origins allowed to use the bridge: the Vite/Tauri dev server, the Tauri production
 * webview schemes, and AUTH_URL's origin. Extend for a hosted/native build via
 * AGENT_IDLE_APP_ORIGINS (comma-separated) — never a wildcard.
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = (() => {
  const out = new Set<string>([
    "http://localhost:1420",
    "http://127.0.0.1:1420", // Vite dev / Tauri dev webview
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost", // Tauri production webview schemes (platform-dependent)
  ]);
  try {
    out.add(new URL(AUTH_URL).origin);
  } catch {
    /* AUTH_URL malformed — ignore */
  }
  for (const o of (process.env.AGENT_IDLE_APP_ORIGINS ?? "").split(",")) {
    const trimmed = o.trim();
    if (trimmed) out.add(trimmed);
  }
  return out;
})();

/** True only when the request addresses the loopback by its real host:port — rejects DNS
 * rebinding, where a hostile domain resolves to 127.0.0.1 but the browser still sends its
 * own name in Host. */
function hostOk(req: IncomingMessage): boolean {
  const host = req.headers.host;
  return host === `127.0.0.1:${DAEMON_PORT}` || host === `localhost:${DAEMON_PORT}`;
}

/** True unless a browser from a non-allowlisted origin is calling. Node callers (no Origin
 * header) always pass; cross-site pages are refused on the state-changing endpoints. */
function originOk(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

/** CORS headers granting one allowlisted browser origin (reflected, never `*`, so a hostile
 * page can never read a response). Empty for Node callers and disallowed origins. */
function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
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
  // Sessions currently flagged "waiting on the human" (a ?/! bubble is up). Tracked so the
  // next tool/prompt event force-emits a clearing signal even when the working renewal would
  // otherwise be throttled — so the bubble drops the instant work resumes.
  const waiting = new Set<string>();
  // Last tool category emitted per session, so a tool that changes the job (e.g. Bash → Edit)
  // force-emits past the renewal throttle and the pet walks to the new room promptly.
  const lastAction = new Map<string, PetAction>();
  // LOCAL-ONLY per-session display hints (repo folder + one-word topic from the first
  // prompt). Served over loopback to the app; NEVER enqueued or sent to Convex.
  const sessionMeta = new Map<string, { repo: string; topic: string; terminal: string }>();
  // Owning `claude` process per session (pid + start-time identity tuple + agent), reported by
  // the hook. Polled for liveness so a hard kill (no SessionEnd) collapses the pet promptly.
  const agentProc = new Map<string, { pid: number; start: string; agent: Agent }>();

  /** Merge LOCAL display hints (repo / one-word topic / terminal name) for a session, filling
   * each field once from whichever event first carries it. Served over loopback to the app. */
  function noteMeta(session: string, payload: HookPayload): void {
    const prev = sessionMeta.get(session) ?? { repo: "", topic: "", terminal: "" };
    sessionMeta.set(session, {
      repo: prev.repo || repoFromCwd(payload.cwd),
      topic: prev.topic || topicWord(payload.prompt ?? ""),
      terminal: prev.terminal || (payload.terminal ?? ""),
    });
  }
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

  /** Spawn / wake this session's pet (idempotent per daemon run; the server also dedups by
   * sessionId). Called on the first prompt AND on SessionStart, so the pet is ready the moment
   * you open the agent — not only once you prompt. */
  function register(session: string, agent: Agent): void {
    if (registered.has(session)) return;
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

  /** Mark the session working at a given job. Renewals are throttled; turn-start and a job
   * CHANGE both force an immediate emit (so the pet switches rooms without waiting the throttle). */
  function working(session: string, agent: Agent, force: boolean, action: PetAction = "none"): void {
    const changed = action !== (lastAction.get(session) ?? "none");
    if (!force && !changed && Date.now() - (workingSentAt.get(session) ?? 0) < RENEW_MS) return;
    workingSentAt.set(session, Date.now());
    lastAction.set(session, action);
    emit(session, agent, { working: true, action });
  }

  function handleHook(payload: HookPayload, agent: Agent): void {
    const session = payload.session_id ?? "default";
    // The hook reports the owning `claude` process on session-registration events. Record it so
    // the poll loop can notice a hard kill. (Same pid every event for a session — idempotent.)
    if (typeof payload.agentPid === "number" && payload.agentStart) {
      agentProc.set(session, { pid: payload.agentPid, start: payload.agentStart, agent });
    }
    switch (payload.hook_event_name) {
      // A session opened / resumed / cleared → spawn-or-wake its pet so it's on screen before
      // the first prompt. Server derives species/name and dedups by sessionId.
      case "SessionStart": {
        const firstStart = !sessionMeta.has(session);
        noteMeta(session, payload);
        register(session, agent);
        if (firstStart) {
          // Announce the terminal/instance name on first start so you can tell pets apart.
          console.log(
            `[agent-idle] session ${tag(session)} started in "${payload.terminal || "unknown terminal"}" (${repoFromCwd(payload.cwd) || "no repo"})`,
          );
        }
        debug(`hook SessionStart agent=${agent} session=${tag(session)} source=${payload.source ?? "?"} → spawn/wake`);
        return;
      }
      // Context compaction is the agent "consolidating memory" mid-task — keep the pet busy at
      // its current job so a long compaction doesn't lapse it to idle.
      case "PreCompact": {
        working(session, agent, false, lastAction.get(session) ?? "none");
        debug(`hook PreCompact agent=${agent} session=${tag(session)} trigger=${payload.trigger ?? "?"} → keep working`);
        return;
      }
      case "UserPromptSubmit": {
        // First prompt of a session → spawn its pet (no-op if SessionStart already did).
        register(session, agent);
        // Capture LOCAL display hints (repo / topic / terminal). If SessionStart didn't fire
        // first (e.g. an older session), announce the terminal here on first sight instead.
        const firstSight = !sessionMeta.has(session);
        noteMeta(session, payload);
        if (firstSight) {
          console.log(
            `[agent-idle] session ${tag(session)} active in "${payload.terminal || "unknown terminal"}" (${repoFromCwd(payload.cwd) || "no repo"})`,
          );
        }
        // Appraise locally. The text is used here and discarded; only numbers persist.
        lastAppraisal.set(session, appraisePrompt(payload.prompt ?? ""));
        waiting.delete(session); // a new prompt answers any pending ?/! bubble
        working(session, agent, true); // turn start → mine now (clears `waiting` to "none")
        debug(`hook UserPromptSubmit agent=${agent} session=${tag(session)} → working`);
        return;
      }
      // Tool activity DURING a turn renews the working window. When the agent stops (turn
      // end OR a Ctrl-C interrupt), these stop firing and the pet lapses to idle.
      case "PreToolUse":
      case "PostToolUse": {
        // If a bubble was up (e.g. permission just granted), force a clear so it drops now
        // instead of waiting out the renewal throttle. The tool name picks the pet's job
        // (mining/chopping/foraging) so it walks to the matching room as tools change.
        const wasWaiting = waiting.delete(session);
        const action = classifyToolAction(payload.tool_name);
        working(session, agent, wasWaiting, action);
        return;
      }
      // A sub-agent (Task) finished — the MAIN agent is still going, so keep the pet busy at
      // its current job (don't reset the room). No tool_name on this event ⇒ reuse lastAction.
      case "SubagentStop": {
        working(session, agent, false, lastAction.get(session) ?? "none");
        return;
      }
      // The session is gone (quit / logout / clear). The authoritative "agent stopped" signal —
      // force the pet idle now instead of waiting out the freshness window, and drop any bubble.
      case "SessionEnd": {
        workingSentAt.delete(session);
        waiting.delete(session);
        lastAction.delete(session);
        registered.delete(session);
        agentProc.delete(session); // clean exit — stop polling its (now exiting) process
        emit(session, agent, { working: false, ended: true });
        debug(`hook SessionEnd agent=${agent} session=${tag(session)} → ended`);
        return;
      }
      // Precise "the agent needs you" signals (richer than Notification): a permission dialog
      // or an MCP input request blocks the turn → show the alert bubble, stop working.
      case "PermissionRequest":
      case "Elicitation": {
        waiting.add(session);
        emit(session, agent, { working: false, waiting: "alert" });
        debug(`hook ${payload.hook_event_name} agent=${agent} session=${tag(session)} → waiting=alert`);
        return;
      }
      // The ask was resolved (denied / MCP answered) → drop the bubble now; a later tool or
      // prompt resumes work.
      case "PermissionDenied":
      case "ElicitationResult": {
        waiting.delete(session);
        emit(session, agent, { working: false });
        return;
      }
      // A sub-agent spawned, or compaction finished → the agent is active; keep the pet busy at
      // its current job (no tool_name on these events ⇒ reuse lastAction).
      case "SubagentStart":
      case "PostCompact": {
        working(session, agent, false, lastAction.get(session) ?? "none");
        return;
      }
      // A tool FAILED but the agent keeps going → stay working at the (failed) tool's job.
      case "PostToolUseFailure": {
        const wasWaiting = waiting.delete(session);
        working(session, agent, wasWaiting, classifyToolAction(payload.tool_name));
        return;
      }
      // The turn ended via an API error (no Stop fires) → the pet is "knocked out" (collapsed
      // at camp) so a failed run is visible, until it recovers or the next turn starts.
      case "StopFailure": {
        workingSentAt.delete(session);
        waiting.delete(session);
        lastAction.delete(session);
        emit(session, agent, { working: false, failed: true });
        debug(`hook StopFailure agent=${agent} session=${tag(session)} → failed (knocked out)`);
        return;
      }
      // The agent wants the human: a permission prompt or an idle wait-for-input. Mark the
      // session waiting (not working) so the ?/! bubble shows; classify the kind locally.
      case "Notification": {
        const kind = classifyNotification(payload.message);
        waiting.add(session);
        emit(session, agent, { working: false, waiting: kind });
        debug(`hook Notification agent=${agent} session=${tag(session)} → waiting=${kind}`);
        return;
      }
      case "Stop": {
        const { tokens } = readTokenUsage(payload.transcript_path, agent);
        const appraisal = lastAppraisal.get(session) ?? appraisePrompt("");
        lastAppraisal.delete(session);
        workingSentAt.delete(session);
        waiting.delete(session);
        lastAction.delete(session);
        // Turn END → stop mining now, and credit the turn (quality energy + tokens). No
        // `waiting` → the reducer resets it to "none", clearing any bubble.
        emit(session, agent, { working: false, appraisal, tokens });
        debug(`hook Stop agent=${agent} session=${tag(session)} → idle (tokens=${tokens}, fill=${appraisal.fill})`);
        return;
      }
      default:
        return; // ignore other hook events
    }
  }

  /**
   * Poll every tracked session's owning `claude` process. If it has disappeared (or its pid was
   * recycled by a different process — caught by the start-time mismatch) and no SessionEnd fired,
   * the harness was hard-killed: emit `ended` so the pet collapses now (dead within ~1 min, gone
   * ~4 min) instead of lingering through passive decay, and drop all of the session's state.
   */
  function checkLiveness(): void {
    for (const [session, proc] of agentProc) {
      if (processStart(proc.pid) === proc.start) continue; // alive, same process
      workingSentAt.delete(session);
      waiting.delete(session);
      lastAction.delete(session);
      lastAppraisal.delete(session);
      registered.delete(session);
      agentProc.delete(session);
      emit(session, proc.agent, { working: false, ended: true });
      debug(`liveness: agent pid=${proc.pid} session=${tag(session)} gone → ended (killed)`);
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

  const server = createServer((req, res) => {
    // Defeat DNS-rebinding first: only serve requests addressed to the real loopback host.
    if (!hostOk(req)) {
      res.writeHead(403).end();
      return;
    }
    // The app posts its token from a different origin (Vite dev server / Tauri webview) with
    // Content-Type: application/json, which triggers a CORS preflight; we answer it — but only
    // for the app's own origins (reflected, never `*`), so no other page can use the bridge.
    const cors = corsHeaders(req);

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors).end(); // preflight — empty cors ⇒ the browser blocks a bad origin
      return;
    }
    // Shared token read — Node-only (the CLI/daemon poll this off the shared store). It returns
    // a bearer credential, so it is NEVER exposed to a browser: no CORS header is sent (a page
    // couldn't read the response) and a request carrying an Origin (i.e. a web page) is refused.
    if (req.method === "GET" && req.url === "/token") {
      if (req.headers.origin) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: readToken() }));
      return;
    }
    // LOCAL-ONLY per-session display hints (repo + topic), keyed by sessionId. The app's webview
    // joins these to its pets for the label, so allow-listed origins may read it; nobody else.
    if (req.method === "GET" && req.url === "/sessions") {
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify(Object.fromEntries(sessionMeta)));
      return;
    }
    // Everything below changes state. Refuse cross-site browser callers (CSRF): Node callers
    // (the hook, `agent-idle kill`) send no Origin and pass; the app posts /auth-token from an
    // allow-listed origin. A hostile page's request is rejected here.
    if (!originOk(req)) {
      res.writeHead(403, cors).end();
      return;
    }
    // `agent-idle kill` asks the daemon to stop. Ack first, then exit once the response has
    // flushed (the caller may see a connection reset instead of the 204 — that's still success).
    if (req.method === "POST" && req.url === "/shutdown") {
      res.writeHead(204, cors).end();
      debug("shutdown requested via /shutdown — exiting");
      setTimeout(() => process.exit(0), 50);
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(404, cors).end();
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
      res.writeHead(204, cors).end();
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
        : "  no auth token yet — run `agent-idle setup` to sign in.",
    );
  });

  setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  setInterval(checkLiveness, LIVENESS_POLL_MS);
}
