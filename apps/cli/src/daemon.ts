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
import { appraisePrompt, type Appraisal, type PetAction } from "@agent-idle/engine";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { type Agent, AUTH_URL, DAEMON_PORT, DAEMON_URL, SOURCES, parseAgent, readToken, resolveConvexUrl, writeToken } from "./config.js";
import { buildFingerprint, isNewerBuild, pingDaemon } from "./daemonControl.js";
import { enqueue, readOutbox, writeOutbox, type IngestArgs } from "./outbox.js";
import { processAlive, processStartTime } from "./proc.js";
import { readTokenUsage } from "./transcript.js";

const FLUSH_INTERVAL_MS = 5_000;
// Re-send a "working" signal at most this often per session (well under the engine's
// workTimeoutMs so an active turn keeps mining, but rare enough not to flood).
const RENEW_MS = 12_000;
// Batch helper token credits so a subagent fan-out produces one parent activity event per short
// window instead of one Convex write per helper. Flushes also run before parent terminal events.
const HELPER_CREDIT_FLUSH_MS = 2_000;
// How long a FINISHED subagent helper is retained in the /subagents feed after its SubagentStop,
// so the app can still play its deliver→poof outro even when the helper lived less than one app
// poll interval. Pruned afterwards (the entry is in-memory and tiny).
const HELPER_RETAIN_MS = 6_000;
// How often to poll each tracked session's owning `claude` process for liveness. When the
// process disappears WITHOUT a SessionEnd (terminal closed, SIGKILL, crash), we emit `ended`
// so the pet collapses now instead of waiting out passive decay. Cheap (a `ps` per session).
const LIVENESS_POLL_MS = 5_000;

// Opt-in debug logging. Off by default (the sensor is quiet in production); the dev
// daemon (`pnpm dev`) turns it on so you can watch the hook→flush pipeline. Accept BOTH
// the `AGENT_IDLE_DEBUG` env var (Unix dev scripts) and a `--debug` argv flag, because
// inline `VAR=1 node …` env syntax is not portable to Windows cmd.exe (`pnpm dev` there
// passes `daemon --debug` instead).
/** This process's build identity, captured at startup — the stale-daemon guard's "own side". */
const OWN_BUILD = buildFingerprint();

const DEBUG = Boolean(process.env.AGENT_IDLE_DEBUG) || process.argv.includes("--debug");
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
const ingestEvents = makeFunctionReference<"mutation">("events:ingestEvents");

/** Events per batched `ingestEvents` call — kept under the server's MAX_BATCH (200) so a
 * long-offline outbox replays in a few calls without tripping per-mutation limits. */
const FLUSH_CHUNK = 100;

/** A throttled "still working" heartbeat and nothing else — the only payload shape
 * `working()` emits. These exist to renew the pet's working window, so between two other
 * events only the LAST one matters; the server books elapsed time by gap, not by count. */
function isPureRenewal(item: IngestArgs): boolean {
  if (item.type !== "activity") return false;
  const p = item.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return false;
  const keys = Object.keys(p);
  return p.working === true && keys.every((k) => k === "working" || k === "action");
}

/**
 * Collapse consecutive same-session, same-action renewals down to the last one. In steady
 * state (5s flush, 12s renewal throttle) this is a no-op; after an OFFLINE stretch the outbox
 * holds hours of heartbeats per session (~5/min) that the server would book identically —
 * every replayed event is server-stamped with the same `now` — so shipping one is equivalent
 * and the rest are pure cost. Any other event from a session is an order barrier.
 */
function coalesceRenewals(items: IngestArgs[]): IngestArgs[] {
  const keep = new Array<boolean>(items.length).fill(true);
  const lastRenewal = new Map<string, number>();
  items.forEach((item, i) => {
    if (isPureRenewal(item)) {
      const prev = lastRenewal.get(item.sessionId);
      const prevItem = prev === undefined ? undefined : items[prev];
      if (prevItem && (prevItem.payload as any)?.action === (item.payload as any)?.action) {
        keep[prev!] = false;
      }
      lastRenewal.set(item.sessionId, i);
    } else {
      lastRenewal.delete(item.sessionId);
    }
  });
  return items.filter((_, i) => keep[i]);
}

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
  /** SubagentStart/Stop + a subagent's OWN tool events: the unique id of the spawned helper
   * (e.g. "a09225e0e6db519d7"). Present only on subagent-scoped events; absent on main-agent
   * events. Lets the daemon track each helper of a parent session independently. LOCAL only. */
  agent_id?: string;
  /** SubagentStart/Stop: the helper's agent type ("general-purpose", "Explore", a custom name).
   * LOCAL display hint only — served over loopback, never sent to Convex. */
  agent_type?: string;
  /** SubagentStop: the helper's OWN transcript (…/subagents/agent-<id>.jsonl). Read LOCALLY for a
   * numeric token count only (like the main transcript at Stop); its content never leaves. */
  agent_transcript_path?: string;
}

/**
 * A live (or just-finished) Claude Code subagent ("helper") of a parent session, tracked in
 * memory ONLY. The app renders each as a mini pet beside its parent. Ephemeral + local: only
 * ids, an agent-type label, an enum action, and timestamps — never prompt/code/message text.
 */
interface HelperLive {
  agentId: string;
  agentType: string;
  /** Last tool category attributed to this helper (from its own PreToolUse/PostToolUse). */
  action: PetAction;
  startedAt: number;
  /** Set at SubagentStop. The entry lingers HELPER_RETAIN_MS longer, served with this stamp, so
   * the app can play the deliver→poof outro even for helpers shorter-lived than one app poll. */
  finishedAt?: number;
  /** Tokens this helper produced (its own transcript at SubagentStop) — DISPLAY only; the durable
   * credit to the PARENT rides a normal activity event. */
  tokens?: number;
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
    // ALL first-party hosted-app origins, unconditionally. The daemon that owns the port
    // is not always the build that opened the auth page (a dev daemon vs the npm CLI's
    // prod page, or an old install vs a newer canonical domain) — if it only trusted its
    // OWN AUTH_URL origin, the page's token post would 403 and `login` would hang. These
    // endpoints only RECEIVE a token / serve local display hints; the secret-reading
    // /token stays browser-denied regardless of origin.
    "https://agent-idle.com",
    "https://www.agent-idle.com",
    "https://agent-idle-app.vercel.app",
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
  // The Convex target is resolved fresh on every flush (see `flush()`), NOT captured here — a
  // daemon that outlives the dev session must honor a repointed `convex-url` file without a kill.
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
  // EPHEMERAL + LOCAL subagent tracking: parentSessionId -> (agentId -> helper). Live helpers, plus
  // those finished within HELPER_RETAIN_MS, are served over loopback at GET /subagents so the app
  // renders mini "helper" pets beside their parent. Never enqueued; only numbers/enums leave.
  const liveHelpers = new Map<string, Map<string, HelperLive>>();
  // Coalesced helper token deltas waiting to be credited to the parent session.
  const pendingHelperCredits = new Map<string, { agent: Agent; tokens: number; action: PetAction }>();

  /** Get-or-create the helper bucket for a parent session. */
  function helperBucket(session: string): Map<string, HelperLive> {
    let bucket = liveHelpers.get(session);
    if (!bucket) {
      bucket = new Map();
      liveHelpers.set(session, bucket);
    }
    return bucket;
  }

  /** Drop finished helpers past their retain window, and empty parent buckets — so stale entries
   * never accumulate. Called on the liveness tick and whenever /subagents is read. */
  function pruneHelpers(): void {
    const now = Date.now();
    for (const [session, bucket] of liveHelpers) {
      for (const [agentId, h] of bucket) {
        if (h.finishedAt != null && now - h.finishedAt > HELPER_RETAIN_MS) bucket.delete(agentId);
      }
      if (bucket.size === 0) liveHelpers.delete(session);
    }
  }

  /** Forget every helper of a parent session (its turn / session ended) so the app poofs them. */
  function clearHelpers(session: string): void {
    liveHelpers.delete(session);
  }

  /** Accumulate helper output as one parent credit per flush window, avoiding fan-out write bursts. */
  function queueHelperCredit(session: string, agent: Agent, tokens: number, action: PetAction): void {
    if (tokens <= 0) return;
    const prev = pendingHelperCredits.get(session);
    pendingHelperCredits.set(session, {
      agent,
      tokens: (prev?.tokens ?? 0) + tokens,
      action,
    });
  }

  /** Emit pending helper credits. When `session` is omitted, flush every parent with a delta. */
  function flushHelperCredits(session?: string): void {
    const entries =
      session != null
        ? pendingHelperCredits.has(session)
          ? ([[session, pendingHelperCredits.get(session)!]] as const)
          : []
        : [...pendingHelperCredits.entries()];
    for (const [parentSession, credit] of entries) {
      pendingHelperCredits.delete(parentSession);
      emit(parentSession, credit.agent, {
        working: true,
        action: lastAction.get(parentSession) ?? credit.action,
        tokens: credit.tokens,
      });
    }
  }

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
        // A subagent's OWN tool event carries its agent_id → attribute the job to THAT helper (its
        // mini pet shows the matching action) and do not touch the parent's room. Still renew the
        // parent's working window at its CURRENT job (throttled) so a long delegation doesn't lapse
        // it to idle while its own tool events are paused.
        if (payload.agent_id) {
          const h = liveHelpers.get(session)?.get(payload.agent_id);
          if (h && h.finishedAt == null) h.action = classifyToolAction(payload.tool_name);
          working(session, agent, false, lastAction.get(session) ?? "none");
          return;
        }
        // Main-agent tool event: if a bubble was up (e.g. permission just granted), force a clear so
        // it drops now instead of waiting out the renewal throttle. The tool name picks the pet's
        // job (mining/chopping/foraging) so it walks to the matching room as tools change.
        const wasWaiting = waiting.delete(session);
        const action = classifyToolAction(payload.tool_name);
        working(session, agent, wasWaiting, action);
        return;
      }
      // A sub-agent (Task) finished. Credit its token output to the PARENT via one ordinary
      // activity event (same additive path as the main Stop; no appraisal ⇒ the prompt-quality
      // average is untouched), keeping the parent mining at its CURRENT job (action MUST be carried
      // — apply() resets an omitted action to "none", which would yank the parent out of its room).
      // Then mark the helper finished, retained briefly so the app can play its deliver→poof outro.
      case "SubagentStop": {
        const parentAction = lastAction.get(session) ?? "none";
        const { tokens } = readTokenUsage(payload.agent_transcript_path, agent);
        if (tokens > 0) queueHelperCredit(session, agent, tokens, parentAction);
        working(session, agent, false, parentAction);
        if (payload.agent_id) {
          const h = liveHelpers.get(session)?.get(payload.agent_id);
          if (h) {
            h.finishedAt = Date.now();
            h.tokens = tokens;
          }
          debug(`hook SubagentStop agent=${agent} session=${tag(session)} helper=${tag(payload.agent_id)} tokens=${tokens}`);
        }
        return;
      }
      // The session is gone (quit / logout / clear). The authoritative "agent stopped" signal —
      // force the pet idle now instead of waiting out the freshness window, and drop any bubble.
      case "SessionEnd": {
        flushHelperCredits(session);
        workingSentAt.delete(session);
        waiting.delete(session);
        lastAction.delete(session);
        registered.delete(session);
        agentProc.delete(session); // clean exit — stop polling its (now exiting) process
        clearHelpers(session); // drop any still-tracked helpers so the app poofs them
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
      // Compaction finished → the agent is active; keep the pet busy at its current job (no
      // tool_name on this event ⇒ reuse lastAction).
      case "PostCompact": {
        working(session, agent, false, lastAction.get(session) ?? "none");
        return;
      }
      // A sub-agent spawned → the PARENT keeps mining at its current job, AND we start tracking the
      // helper so the app can render it as a mini pet beside the parent (local visual only).
      case "SubagentStart": {
        working(session, agent, false, lastAction.get(session) ?? "none");
        if (payload.agent_id) {
          helperBucket(session).set(payload.agent_id, {
            agentId: payload.agent_id,
            agentType: payload.agent_type ?? "subagent",
            action: "none",
            startedAt: Date.now(),
          });
          debug(`hook SubagentStart agent=${agent} session=${tag(session)} helper=${tag(payload.agent_id)} (${payload.agent_type ?? "subagent"})`);
        }
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
        flushHelperCredits(session);
        workingSentAt.delete(session);
        waiting.delete(session);
        lastAction.delete(session);
        clearHelpers(session); // turn errored out — drop any tracked helpers
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
        flushHelperCredits(session);
        lastAppraisal.delete(session);
        workingSentAt.delete(session);
        waiting.delete(session);
        lastAction.delete(session);
        clearHelpers(session); // turn ended — any lingering helpers poof now
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
    pruneHelpers(); // drop finished helpers past their retain window (cheap, runs on the same tick)
    for (const [session, proc] of agentProc) {
      if (processAlive(proc.pid)) {
        // Alive. If we can read a start time and it still matches, it's definitely our process.
        // An unreadable start time ("" — e.g. `ps` momentarily failed or isn't present) must
        // NOT be read as "gone": keep the session rather than killing a live pet.
        const start = processStartTime(proc.pid);
        if (!start || start === proc.start) continue;
        // start time changed ⇒ the pid was recycled by a different process ⇒ treat as gone.
      }
      workingSentAt.delete(session);
      waiting.delete(session);
      lastAction.delete(session);
      lastAppraisal.delete(session);
      registered.delete(session);
      agentProc.delete(session);
      flushHelperCredits(session);
      clearHelpers(session); // process gone — drop its helpers too
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
      const convexUrl = resolveConvexUrl(); // re-read each tick so a repoint is honored live
      debug(`flush: posting ${items.length} event(s) to ${convexUrl}`);
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(token);

      const remaining: typeof items = [];
      // One batched mutation per chunk: one function call, one transaction, one reactive
      // refetch of this account's queries — instead of all three per raw event.
      const queue = coalesceRenewals(items);
      let batchSupported = true;
      for (let i = 0; i < queue.length; i += FLUSH_CHUNK) {
        const chunk = queue.slice(i, i + FLUSH_CHUNK);
        if (batchSupported) {
          try {
            const res = await client.mutation(ingestEvents, { events: chunk });
            // success (accepted or rejected-but-processed) → drop; dedup makes retries safe
            debug(`  batch of ${chunk.length} →`, res);
            continue;
          } catch (err) {
            const msg = (err as Error)?.message ?? String(err);
            if (!/Could not find public function/i.test(msg)) {
              remaining.push(...chunk); // network/auth error — keep for next tick
              debug(`  batch of ${chunk.length} FAILED:`, msg);
              continue;
            }
            // Backend predates events:ingestEvents — fall back to per-event delivery.
            batchSupported = false;
            debug("  batch unsupported by backend — falling back to per-event");
          }
        }
        for (const item of chunk) {
          try {
            const res = await client.mutation(ingestEvent, item);
            debug(`  ${item.type} session=${tag(item.sessionId)} →`, res);
          } catch (err) {
            remaining.push(item); // network/auth error — keep for next tick
            debug(`  ${item.type} session=${tag(item.sessionId)} FAILED:`, (err as Error)?.message ?? err);
          }
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
    // Which build owns the port (Node callers only — used by a starting daemon to decide
    // whether the incumbent is stale and should be asked to retire).
    if (req.method === "GET" && req.url === "/build") {
      if (req.headers.origin) {
        res.writeHead(403).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...OWN_BUILD, pid: process.pid }));
      return;
    }
    // LOCAL-ONLY per-session display hints (repo + topic), keyed by sessionId. The app's webview
    // joins these to its pets for the label, so allow-listed origins may read it; nobody else.
    if (req.method === "GET" && req.url === "/sessions") {
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify(Object.fromEntries(sessionMeta)));
      return;
    }
    // LOCAL-ONLY live subagent ("helper") tracking, keyed by parent sessionId. The app joins these
    // to its pets to render mini helper pets. The payload carries ONLY ids, an agent-type label, an
    // enum action, and timestamps — never prompt/code/message text. Same origin guard as /sessions.
    if (req.method === "GET" && req.url === "/subagents") {
      pruneHelpers();
      const out: Record<string, HelperLive[]> = {};
      for (const [session, bucket] of liveHelpers) {
        if (bucket.size > 0) out[session] = [...bucket.values()];
      }
      res.writeHead(200, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
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
    // Stale-daemon guard: any state-changing caller stamped with a NEWER build fingerprint
    // means the code on disk moved past this process (rebuild / npm update). Finish this
    // request, then retire — the caller's next hook auto-respawns the new build. This is
    // what makes updates self-healing instead of "kill port 47615 and hope".
    const callerBuild = Number(req.headers["x-agent-idle-build"]);
    if (isNewerBuild(callerBuild, OWN_BUILD)) {
      debug(`caller build ${callerBuild} > own ${OWN_BUILD.mtimeMs} — retiring after this request`);
      setTimeout(() => process.exit(0), 250); // enqueue below is synchronous — nothing is lost
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

  /**
   * Port already owned: usually a redundant spawn (two near-simultaneous hooks) — but it
   * can also be a STALE daemon from an older build squatting the port for days. Ask the
   * incumbent for its build; if we are strictly newer, tell it to retire (the /shutdown
   * it already serves for `agent-idle kill`) and take the port over. Anything else —
   * incumbent same/newer, pre-guard build (no /build route), unreachable — exit quietly,
   * preserving the old redundant-spawn behavior.
   */
  async function takeoverIfStale(): Promise<void> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 800);
      const res = await fetch(`${DAEMON_URL}/build`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) process.exit(0); // pre-guard daemon — old behavior
      const incumbent = (await res.json()) as { mtimeMs?: number };
      if (!isNewerBuild(OWN_BUILD.mtimeMs, { script: "", mtimeMs: incumbent.mtimeMs ?? 0 })) {
        process.exit(0); // incumbent is same/newer — we're the redundant one
      }
      debug(`incumbent build ${incumbent.mtimeMs} is stale — asking it to retire`);
      await fetch(`${DAEMON_URL}/shutdown`, { method: "POST" }).catch(() => {});
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (!(await pingDaemon())) {
          server.listen(DAEMON_PORT, "127.0.0.1", () => {
            console.log(`agent-idle daemon took over port ${DAEMON_PORT} from a stale build`);
          });
          return;
        }
      }
    } catch {
      /* incumbent unreachable mid-probe — fall through */
    }
    process.exit(0);
  }

  let takeoverAttempted = false;
  server.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE" && !takeoverAttempted) {
      takeoverAttempted = true; // a second failure (lost the takeover race) exits below
      void takeoverIfStale();
      return;
    }
    process.exit(0);
  });

  server.listen(DAEMON_PORT, "127.0.0.1", () => {
    console.log(`agent-idle daemon listening on http://127.0.0.1:${DAEMON_PORT}`);
    console.log(
      readToken()
        ? "  shared auth token present."
        : "  no auth token yet — run `agent-idle setup` to sign in.",
    );
  });

  setInterval(() => void flush(), FLUSH_INTERVAL_MS);
  setInterval(() => flushHelperCredits(), HELPER_CREDIT_FLUSH_MS);
  setInterval(checkLiveness, LIVENESS_POLL_MS);
}
