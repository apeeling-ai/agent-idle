/** Paths, ports, and the persisted Convex Auth token. Node-only (this is the sensor side). */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Loopback-only port the Claude Code hooks (and the app's token bridge) POST to. */
export const DAEMON_PORT = 47615;
export const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;

export const STATE_DIR = join(homedir(), ".agent-idle");
export const OUTBOX_PATH = join(STATE_DIR, "outbox.jsonl");
/**
 * The SHARED machine session token (source of truth). Either surface can write it —
 * the app after Convex Auth sign-in (via the daemon's /auth-token bridge), or the CLI
 * `login` command. The daemon reads it fresh on every flush, so a `logout` from either
 * side propagates. One session, shared by the app, the CLI, and the daemon.
 */
export const AUTH_TOKEN_PATH = join(STATE_DIR, "auth.json");
export const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
/** Codex discovers hooks here (one of its supported locations). */
export const CODEX_HOOKS_PATH = join(homedir(), ".codex", "hooks.json");

/**
 * Supported coding agents. Both feed the SAME daemon (same loopback `/hook`, same
 * outbox, same auth, same per-session pet) — the agent only selects the provenance tag
 * and which transcript format to parse. Claude is the default for back-compat.
 */
export type Agent = "claude" | "codex";
export const AGENTS: readonly Agent[] = ["claude", "codex"];
export function parseAgent(arg: string | undefined): Agent {
  return arg === "codex" ? "codex" : "claude";
}

/**
 * Parse one or more agents from CLI tokens (e.g. `setup claude codex`, `setup claude,codex`,
 * or `setup all`), de-duplicated and in canonical order. Unknown tokens are ignored; an empty
 * or all-unknown selection falls back to `["claude"]` for back-compat.
 */
export function parseAgents(args: readonly string[]): Agent[] {
  const tokens = args.flatMap((a) => a.split(",")).map((t) => t.trim().toLowerCase());
  const wantAll = tokens.includes("all");
  const selected = AGENTS.filter((agent) => wantAll || tokens.includes(agent));
  return selected.length > 0 ? [...selected] : ["claude"];
}

/** Provenance written to the event ledger. Claude keeps "cli-daemon" for back-compat. */
export const SOURCES: Record<Agent, string> = {
  claude: "cli-daemon",
  codex: "codex-daemon",
};

/**
 * Where the daemon posts events. Precedence: `CONVEX_URL` env (set by `pnpm dev` / `dev:cloud`)
 * > a persisted override file > the local default. The persisted file exists so that a daemon
 * AUTO-SPAWNED by a hook — which does NOT inherit the dev shell's env — still targets the same
 * deployment the dev session chose. `pnpm dev:cloud` writes it on start and removes it on exit,
 * so cloud targeting is scoped to cloud sessions and plain `pnpm dev` stays local.
 */
export const CONVEX_URL_PATH = join(STATE_DIR, "convex-url");
function persistedConvexUrl(): string | null {
  try {
    return existsSync(CONVEX_URL_PATH) ? readFileSync(CONVEX_URL_PATH, "utf8").trim() || null : null;
  } catch {
    return null;
  }
}
const LOCAL_CONVEX_URL = "http://127.0.0.1:3210";
/**
 * Resolve the daemon's Convex target LIVE (env > persisted override file > local default).
 * Call this fresh on every flush — NOT once at startup. A long-lived daemon (auto-spawned by a
 * hook, then outliving the dev session that wrote the override) must pick up a corrected
 * `convex-url` file without being killed; capturing the URL once was what stranded ~5 days of
 * events in the outbox against a dead local deployment. Mirrors how `readToken()` is re-read.
 */
export function resolveConvexUrl(): string {
  return process.env.CONVEX_URL ?? persistedConvexUrl() ?? LOCAL_CONVEX_URL;
}
/** Module-load snapshot, for callers that legitimately resolve once. Long-lived loops should
 * prefer `resolveConvexUrl()` so a deployment repoint is honored without a restart. */
export const DEFAULT_CONVEX_URL = resolveConvexUrl();

/**
 * The web auth page `agent-idle login` opens in the system browser. It's the app's own
 * React frontend (the only legitimate Convex Auth client); after sign-in it posts the
 * token to the daemon's shared loopback. Dev = the Vite dev server. Override for a built
 * deployment via AGENT_IDLE_AUTH_URL.
 */
export const AUTH_URL = process.env.AGENT_IDLE_AUTH_URL ?? "http://localhost:1420";

export function ensureDir(path: string, mode?: number): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, ...(mode !== undefined ? { mode } : {}) });
  if (mode !== undefined) {
    try {
      chmodSync(dir, mode); // mkdir's mode only applies on creation — tighten a pre-existing dir
    } catch {
      /* best effort */
    }
  }
}

export function readToken(): string | null {
  if (!existsSync(AUTH_TOKEN_PATH)) return null;
  try {
    return (JSON.parse(readFileSync(AUTH_TOKEN_PATH, "utf8")) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  // The token is a bearer credential — keep the dir and file owner-only so another local user
  // can't read it (default umask would otherwise leave them 0755/0644 = world-readable).
  ensureDir(AUTH_TOKEN_PATH, 0o700);
  writeFileSync(AUTH_TOKEN_PATH, JSON.stringify({ token }) + "\n", { mode: 0o600 });
  try {
    chmodSync(AUTH_TOKEN_PATH, 0o600); // tighten a pre-existing (possibly 0644) file too
  } catch {
    /* best effort */
  }
}

export function clearToken(): void {
  try {
    if (existsSync(AUTH_TOKEN_PATH)) rmSync(AUTH_TOKEN_PATH);
  } catch {
    /* nothing to clear */
  }
}
