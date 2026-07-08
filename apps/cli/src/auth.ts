/**
 * CLI sign-in via the device-authorization grant (see convex/deviceAuth.ts). The machine gets its
 * OWN Convex Auth session with its own refresh-token chain, so the daemon can self-refresh
 * independently of the app.
 *
 * `signIn` registers a device code (a secret `deviceId` it keeps + a human `userCode` for the URL),
 * opens the app's browser sign-in page, and polls until the signed-in browser approves the code.
 * Then it completes its OWN sign-in through the `device` credentials provider by presenting the
 * secret `deviceId` — Convex Auth hands the tokens straight back here. The token never passes
 * through the browser, and the browser keeps its own session. The browser still performs the
 * supported Convex Auth flow (GitHub or email/password) to establish who is approving.
 */

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { cliAuthUrl, readToken, resolveConvexUrl, writeTokens } from "./config.js";
import { pingDaemon, spawnDaemon } from "./daemonControl.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const createDeviceAuth = makeFunctionReference<"mutation">("deviceAuth:create");
const statusDeviceAuth = makeFunctionReference<"mutation">("deviceAuth:status");
/** Convex Auth's sign-in action; with `provider: "device"` it redeems an approved device code. */
const authSignIn = makeFunctionReference<"action">("auth:signIn");

function userCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

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
    console.log("✓ Already signed in (session at ~/.agent-idle/auth.json).");
    return;
  }

  // Always (re)spawn the shared loopback receiver and let the port takeover sort out who
  // wins: with no incumbent the spawn just listens; a STALE incumbent (an older build) is asked
  // to retire and replaced; a same/newer incumbent makes the spawn exit as redundant. This keeps
  // `login` self-healing instead of trusting whatever happens to own the port.
  spawnDaemon();
  const settleBy = Date.now() + 5_000;
  while (Date.now() < settleBy && !(await pingDaemon())) await sleep(250);

  const client = new ConvexHttpClient(resolveConvexUrl());
  const deviceId = randomUUID(); // secret bearer — never leaves this machine's requests
  const code = userCode(); // human-visible approval code, put in the browser URL
  await client.mutation(createDeviceAuth, { deviceId, userCode: code });

  const authUrl = cliAuthUrl(code);
  console.log(`\nOpening ${authUrl} to sign in (GitHub or email + password)…`);
  console.log(`Your device code is ${code}.`);
  console.log("If it doesn't open, visit that URL manually. Waiting for sign-in… (Ctrl-C to cancel)");
  openBrowser(authUrl);

  const deadline = Date.now() + 300_000; // 5 min — room to sign in (incl. GitHub OAuth) in the browser
  while (Date.now() < deadline) {
    await sleep(1500);
    const res = (await client.mutation(statusDeviceAuth, { deviceId })) as {
      status: "pending" | "approved" | "expired" | "consumed" | "not_found";
    };
    if (res.status === "approved") {
      // Complete OUR own sign-in by redeeming the approved code — Convex Auth mints this machine
      // its own session and returns the tokens directly.
      const signedIn = (await client.action(authSignIn, {
        provider: "device",
        params: { deviceId },
      })) as { tokens: { token: string; refreshToken: string } | null };
      if (!signedIn?.tokens) {
        console.log("Sign-in could not be completed. Re-run `agent-idle setup`.");
        return;
      }
      writeTokens({ token: signedIn.tokens.token, refreshToken: signedIn.tokens.refreshToken });
      console.log("✓ Signed in — this machine has its own session; the daemon keeps it fresh on its own.");
      return;
    }
    if (res.status === "expired" || res.status === "consumed") break;
  }
  console.log("Timed out waiting for sign-in. Re-run `agent-idle setup` once you've signed in.");
}
