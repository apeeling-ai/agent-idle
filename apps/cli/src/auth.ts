/**
 * Shared auth from the CLI side. Auth is a single machine-shared session
 * (config.AUTH_TOKEN_PATH); either the app or the CLI can establish it, and the
 * daemon's loopback port is the shared receiver.
 *
 * `signIn` ensures the daemon (owns the shared port) is up, opens the system browser to
 * the app's auth page (the only legitimate Convex Auth client — GitHub or email/
 * password), and polls the shared port until that page posts back the token. We never
 * hand-roll OAuth; the browser page does the supported Convex Auth flow. It's run as the
 * second half of `agent-idle setup`, right after the hook is registered.
 */

import { spawn } from "node:child_process";
import { AUTH_URL, readToken } from "./config.js";
import { daemonToken, pingDaemon, spawnDaemon } from "./daemonControl.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function openBrowser(url: string): void {
  const [bin, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(bin as string, args as string[], {
      stdio: "ignore",
      detached: true,
    }).unref();
  } catch {
    /* fall back to the printed URL */
  }
}

export async function signIn(): Promise<void> {
  if (readToken()) {
    console.log(
      "✓ Already signed in (shared session at ~/.agent-idle/auth.json).",
    );
    return;
  }

  // Always (re)spawn the shared loopback receiver and let the port takeover sort out who
  // wins: with no incumbent the spawn just listens; a STALE incumbent (an older build
  // whose origin allowlist would 403 the auth page's token post forever) is asked to
  // retire and replaced; a same/newer incumbent makes the spawn exit as redundant. This
  // keeps `login` self-healing instead of trusting whatever happens to own the port.
  spawnDaemon();
  const settleBy = Date.now() + 5_000;
  while (Date.now() < settleBy && !(await pingDaemon())) await sleep(250);

  console.log(`\nOpening ${AUTH_URL} to sign in (GitHub or email + password)…`);
  console.log(
    "If it doesn't open, visit that URL manually. Waiting for sign-in… (Ctrl-C to cancel)",
  );
  openBrowser(AUTH_URL);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    if ((await daemonToken()) ?? readToken()) {
      console.log(
        "✓ Signed in — shared session established for the app, CLI, and daemon.",
      );
      return;
    }
  }
  console.log(
    "Timed out waiting for sign-in. Re-run `agent-idle setup` once you've signed in.",
  );
}
