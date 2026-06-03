/**
 * The hook entrypoint (`agent-idle hook [claude|codex]`). MUST be fire-and-forget: it
 * reads the hook payload from stdin, POSTs it to the local daemon, writes nothing to
 * stdout, swallows all errors, and exits 0 — never blocking a turn.
 *
 * Claude Code and Codex both use the same hook event names and stdin-JSON payload, so the
 * one binary serves both. The agent arg (default "claude") rides along as `?agent=` so the
 * daemon can tag provenance and pick the right transcript parser.
 *
 * The daemon is AUTOMATIC: if it isn't running, the hook spawns it (detached) and retries
 * once. Steady state (daemon already up) is a single fast POST; only the rare cold start
 * pays a short wait while the daemon binds.
 */

import { DAEMON_URL, parseAgent } from "./config.js";
import { spawnDaemon } from "./daemonControl.js";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

async function postToDaemon(url: string, body: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    await fetch(url, {
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

export async function runHook(agentArg: string | undefined): Promise<void> {
  const url = `${DAEMON_URL}/hook?agent=${parseAgent(agentArg)}`;
  let body = "{}";
  try {
    body = (await readStdin()) || "{}";
  } catch {
    /* ignore */
  }

  if (await postToDaemon(url, body)) return;

  // Daemon wasn't running → start it automatically, then retry once it has bound.
  spawnDaemon();
  await sleep(600);
  await postToDaemon(url, body); // best-effort; if still starting, this event is skipped (next works)
}
