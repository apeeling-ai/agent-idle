/**
 * The desktop app's browser-based device sign-in (see convex/deviceAuth.ts). The Tauri webview is
 * a poor place for an OAuth redirect, so the app plays the "device": it registers a code (a secret
 * `deviceId` it keeps + a human `userCode`), opens the SYSTEM browser to the web `/device` page
 * (the real Convex Auth client), and waits for the signed-in browser to APPROVE the code. The
 * browser keeps its own session — it mints nothing. The app then completes its OWN sign-in through
 * the `device` credentials provider by presenting `deviceId`, gets its own `{ token, refreshToken }`
 * directly, and seeds ConvexAuthProvider's storage so it owns refresh from here on. No hand-rolled
 * crypto, no token relayed through the browser.
 */

import { openUrl } from "@tauri-apps/plugin-opener";
import { api, convex, convexUrl } from "./convex";

// Where the web app (the real Convex Auth client) is served. MUST target the same Convex
// deployment as `convex`, so the code we register here is found by the browser page. Defaults
// cover both channels; override with VITE_AUTH_URL for a one-off (e.g. a custom dev host).
const AUTH_URL =
  (import.meta.env.VITE_AUTH_URL as string | undefined) ??
  (import.meta.env.PROD ? "https://agent-idle.com" : "http://localhost:1420");

// @convex-dev/auth namespaces its localStorage keys by the client address, stripped of every
// non-alphanumeric char (see useNamespacedStorage in @convex-dev/auth/react). Match it exactly.
const NS = convexUrl.replace(/[^a-zA-Z0-9]/g, "");
const JWT_KEY = `__convexAuthJWT_${NS}`;
const REFRESH_KEY = `__convexAuthRefreshToken_${NS}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function userCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export type ConnectStatus = "waiting" | "connected" | "error";

/**
 * Run the device sign-in: open the browser, wait (up to ~5 min) for the user to approve, complete
 * this app's own sign-in, seed the auth provider, then reload so ConvexAuthProvider reads the
 * session on mount. Throws on timeout/failure; the caller surfaces `onStatus`/the error.
 */
export async function connectViaBrowser(onStatus?: (s: ConnectStatus) => void): Promise<void> {
  onStatus?.("waiting");
  const deviceId = crypto.randomUUID(); // secret bearer — never sent to the browser
  const code = userCode(); // human-visible approval code
  await convex.mutation(api.deviceAuth.create, { deviceId, userCode: code });

  const url = new URL("/device", AUTH_URL);
  url.searchParams.set("code", code);
  await openUrl(url.toString());

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const res = await convex.mutation(api.deviceAuth.status, { deviceId });
    if (res.status === "approved") {
      // Complete THIS app's own sign-in by redeeming the approved code.
      const signedIn = (await convex.action(api.auth.signIn, {
        provider: "device",
        params: { deviceId },
      })) as { tokens?: { token: string; refreshToken: string } | null };
      if (!signedIn?.tokens) throw new Error("Sign-in could not be completed. Click Connect to retry.");
      localStorage.setItem(JWT_KEY, signedIn.tokens.token);
      localStorage.setItem(REFRESH_KEY, signedIn.tokens.refreshToken);
      onStatus?.("connected");
      window.location.reload(); // ConvexAuthProvider seeds from storage on mount
      return;
    }
    if (res.status === "expired" || res.status === "consumed") break;
  }
  onStatus?.("error");
  throw new Error("Timed out waiting for sign-in. Click Connect to try again.");
}
