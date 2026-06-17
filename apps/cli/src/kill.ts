/**
 * `agent-idle kill` — stop the long-lived sensor daemon. It POSTs to the daemon's loopback
 * `/shutdown` endpoint (same trust model as the rest of the bridge), which acks and exits.
 * Graceful and cross-platform — no PID files or `lsof`/`taskkill` process hunting.
 *
 * Handy after rebuilding the CLI: the daemon keeps running the old code until it's stopped,
 * so `agent-idle kill` lets the next hook auto-spawn a fresh daemon on the new build.
 */

import { DAEMON_URL } from "./config.js";
import { pingDaemon } from "./daemonControl.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function kill(): Promise<void> {
  if (!(await pingDaemon())) {
    console.log("No agent-idle daemon is running.");
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    await fetch(`${DAEMON_URL}/shutdown`, { method: "POST", signal: controller.signal });
    clearTimeout(timer);
  } catch {
    // The daemon often exits before the response returns (connection reset) — that's success.
  }

  // Confirm it's actually gone before reporting.
  await sleep(250);
  if (await pingDaemon()) {
    console.log(
      "Asked the daemon to stop, but it's still responding. Re-run `agent-idle kill`, " +
        "or kill whatever holds port 47615.",
    );
  } else {
    console.log("✓ Stopped the agent-idle daemon. The next hook will start a fresh one.");
  }
}
