/**
 * Shared auth from the CLI side. Auth is a single machine-shared session
 * (config.AUTH_TOKEN_PATH); either the app or the CLI can establish it, and the
 * daemon's loopback port is the shared receiver.
 *
 * `login` ensures the daemon (owns the shared port) is up, opens the system browser to
 * the app's auth page (the only legitimate Convex Auth client — GitHub or email/
 * password), and polls the shared port until that page posts back the token. We never
 * hand-roll OAuth; the browser page does the supported Convex Auth flow.
 *
 * `logout` clears the shared session for every surface (the daemon reads it fresh each
 * flush).
 */

import { spawn } from "node:child_process";
import { AUTH_URL, clearToken, readToken } from "./config.js";
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
    spawn(bin as string, args as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    /* fall back to the printed URL */
  }
}

export async function login(): Promise<void> {
  if (readToken()) {
    console.log("Already signed in (shared session at ~/.agent-idle/auth.json).");
    return;
  }

  // Make sure the shared loopback receiver is running before we open the browser.
  if (!(await pingDaemon())) {
    spawnDaemon();
    await sleep(700);
  }

  console.log(`Opening ${AUTH_URL} to sign in (GitHub or email + password)…`);
  console.log("If it doesn't open, visit that URL manually. Waiting for sign-in… (Ctrl-C to cancel)");
  openBrowser(AUTH_URL);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    if ((await daemonToken()) ?? readToken()) {
      console.log("✓ Signed in — shared session established for the app, CLI, and daemon.");
      return;
    }
  }
  console.log("Timed out waiting for sign-in. Re-run `agent-idle login` once you've signed in.");
}

export function logout(): void {
  clearToken();
  console.log("Signed out — cleared the shared session. The daemon stops posting on its next tick.");
}
