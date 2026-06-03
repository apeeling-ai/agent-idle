/** Paths, ports, and the persisted Convex Auth token. Node-only (this is the sensor side). */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

export const SOURCE = "cli-daemon";

/** Default to the local Convex deployment; overridable via env. */
export const DEFAULT_CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";

/**
 * The web auth page `agent-idle login` opens in the system browser. It's the app's own
 * React frontend (the only legitimate Convex Auth client); after sign-in it posts the
 * token to the daemon's shared loopback. Dev = the Vite dev server. Override for a built
 * deployment via AGENT_IDLE_AUTH_URL.
 */
export const AUTH_URL = process.env.AGENT_IDLE_AUTH_URL ?? "http://localhost:1420";

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
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
  ensureDir(AUTH_TOKEN_PATH);
  writeFileSync(AUTH_TOKEN_PATH, JSON.stringify({ token }) + "\n");
}

export function clearToken(): void {
  try {
    if (existsSync(AUTH_TOKEN_PATH)) rmSync(AUTH_TOKEN_PATH);
  } catch {
    /* nothing to clear */
  }
}
