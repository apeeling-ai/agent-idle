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
/**
 * Build-time defaults, inlined by tsup for the published npm bundle (see
 * apps/cli/tsup.config.ts) so a global/npx install targets prod out of the box.
 * The tsc dev build leaves these as runtime env reads — normally unset, so dev
 * keeps the localhost defaults below.
 */
const BUILD_CONVEX_URL = process.env.AGENT_IDLE_BUILD_CONVEX_URL || undefined;
const BUILD_AUTH_URL = process.env.AGENT_IDLE_BUILD_AUTH_URL || undefined;

const LOCAL_CONVEX_URL = "http://127.0.0.1:3210";
/**
 * Resolve the daemon's Convex target LIVE — call fresh on every flush, NOT once at startup, so a
 * long-lived daemon (auto-spawned by a hook, then outliving the dev session) honors a repoint
 * without being killed; capturing it once stranded ~5 days of events against a dead deployment.
 *
 * Precedence: `CONVEX_URL` env > baked build URL > persisted override file > local default.
 * The baked URL outranks the persisted override ON PURPOSE: `~/.agent-idle/convex-url` is a
 * machine-GLOBAL file written by a `dev:cloud` session, but a PUBLISHED bundle has prod baked in.
 * When both exist (a dev session's override left on a machine that also runs the published CLI),
 * letting the override win pinned the prod binary to a *dev* deployment — so a prod-minted token
 * 401'd there and events silently never reached prod. A published bundle must trust its own prod
 * default; the override only steers a DEV build (no baked URL), i.e. the hook-auto-spawned dev
 * daemon it was designed for. For the flush itself, `convexUrlFromToken` takes final say so the
 * event target can never diverge from the deployment that authenticated the caller.
 */
export function resolveConvexUrl(): string {
  return process.env.CONVEX_URL ?? BUILD_CONVEX_URL ?? persistedConvexUrl() ?? LOCAL_CONVEX_URL;
}

/**
 * The Convex CLOUD URL that MINTED this auth token, derived from its JWT `iss` claim (Convex Auth
 * sets `iss` = `CONVEX_SITE_URL` = `https://<deployment>.convex.site`). A token is only valid on
 * the deployment that issued it, so the daemon must deliver events THERE — otherwise a stale
 * target (env/override/build drift) makes every mutation 401 and the outbox backs up forever.
 * Returns null for local backends (their issuer is an `http://127.0.0.1:*` site, not a
 * `*.convex.site` host) so localhost dev keeps using the resolved target. Best-effort: any
 * malformed token yields null and the caller falls back to `resolveConvexUrl()`.
 */
export function convexUrlFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const iss = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss?: unknown })
      .iss;
    if (typeof iss !== "string") return null;
    const match = /^https:\/\/([a-z0-9-]+)\.convex\.site\/?$/.exec(iss);
    return match ? `https://${match[1]}.convex.cloud` : null;
  } catch {
    return null;
  }
}

/** The JWT's expiry as epoch-ms (from the `exp` claim), or null if unreadable. Used to decide
 *  when the daemon should refresh — the token is signed, so reading `exp` needs no verification. */
export function jwtExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const exp = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown })
      .exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}
/** Module-load snapshot, for callers that legitimately resolve once. Long-lived loops should
 * prefer `resolveConvexUrl()` so a deployment repoint is honored without a restart. */
export const DEFAULT_CONVEX_URL = resolveConvexUrl();

/**
 * The web auth page `agent-idle setup` opens in the system browser. It's the app's own
 * React frontend (the only legitimate Convex Auth client); after sign-in it approves the
 * CLI device code through Convex. Dev = the Vite dev server. Override for a built deployment
 * via AGENT_IDLE_AUTH_URL.
 */
export const AUTH_URL = process.env.AGENT_IDLE_AUTH_URL ?? BUILD_AUTH_URL ?? "http://localhost:1420";

export function cliAuthUrl(userCode?: string): string {
  try {
    const url = new URL("/device", AUTH_URL);
    if (userCode) url.searchParams.set("code", userCode);
    return url.toString();
  } catch {
    const base = AUTH_URL.replace(/\/$/, "");
    const code = userCode ? `?code=${encodeURIComponent(userCode)}` : "";
    return `${base}/device${code}`;
  }
}

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

/**
 * The persisted machine session. `token` is the ~1h Convex Auth JWT; `refreshToken` (present
 * since the device flow moved to per-machine sessions) is the long-lived, ROTATING credential the
 * daemon exchanges for fresh JWTs via `auth:signIn({refreshToken})`. Both are bearer secrets — the
 * store is owner-only (0600). Older files hold just `{ token }`; those keep working read-only until
 * the next sign-in writes a refresh token.
 */
export interface AuthTokens {
  token: string;
  refreshToken?: string | undefined;
}

export function readTokens(): AuthTokens | null {
  if (!existsSync(AUTH_TOKEN_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(AUTH_TOKEN_PATH, "utf8")) as AuthTokens;
    return parsed.token ? { token: parsed.token, refreshToken: parsed.refreshToken } : null;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  return readTokens()?.token ?? null;
}

export function writeTokens(tokens: AuthTokens): void {
  // The tokens are bearer credentials — keep the dir and file owner-only so another local user
  // can't read them (default umask would otherwise leave them 0755/0644 = world-readable).
  ensureDir(AUTH_TOKEN_PATH, 0o700);
  const payload: AuthTokens = { token: tokens.token };
  if (tokens.refreshToken) payload.refreshToken = tokens.refreshToken;
  writeFileSync(AUTH_TOKEN_PATH, JSON.stringify(payload) + "\n", { mode: 0o600 });
  try {
    chmodSync(AUTH_TOKEN_PATH, 0o600); // tighten a pre-existing (possibly 0644) file too
  } catch {
    /* best effort */
  }
}

/** Back-compat shim: write only an access token (no refresh). Prefer `writeTokens`. */
export function writeToken(token: string): void {
  writeTokens({ token });
}

export function clearToken(): void {
  try {
    if (existsSync(AUTH_TOKEN_PATH)) rmSync(AUTH_TOKEN_PATH);
  } catch {
    /* nothing to clear */
  }
}
