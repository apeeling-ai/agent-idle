/**
 * Helpers for talking to / starting the long-lived daemon. Shared by the hook
 * (auto-start) and `login` (ensure the shared loopback receiver is up, then read the
 * token it captures).
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DAEMON_URL } from "./config.js";

/** Start the long-lived daemon, fully detached so it outlives the short-lived caller. */
export function spawnDaemon(): void {
  const indexPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const child = spawn(process.execPath, [indexPath, "daemon"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/** True if the daemon's loopback server answers. */
export async function pingDaemon(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    const res = await fetch(`${DAEMON_URL}/token`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/** The current shared session token from the daemon, or null. */
export async function daemonToken(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`${DAEMON_URL}/token`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token?: string | null };
    return token ?? null;
  } catch {
    return null;
  }
}
