/**
 * The Claude Code hook entrypoint (`agent-idle hook`). MUST be fire-and-forget: it reads
 * the hook payload from stdin, POSTs it to the local daemon, writes nothing to stdout,
 * swallows all errors, and exits 0 — never blocking a turn.
 *
 * The daemon is AUTOMATIC: if it isn't running, the hook spawns it (detached) and retries
 * once. Steady state (daemon already up) is a single fast POST; only the rare cold start
 * pays a short wait while the daemon binds.
 */

import { DAEMON_URL } from "./config.js";
import { spawnDaemon } from "./daemonControl.js";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

async function postToDaemon(body: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    await fetch(`${DAEMON_URL}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false; // daemon down / timeout
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runHook(): Promise<void> {
  let body = "{}";
  try {
    body = (await readStdin()) || "{}";
  } catch {
    /* ignore */
  }

  if (await postToDaemon(body)) return;

  // Daemon wasn't running → start it automatically, then retry once it has bound.
  spawnDaemon();
  await sleep(600);
  await postToDaemon(body); // best-effort; if still starting, this event is skipped (next works)
}
