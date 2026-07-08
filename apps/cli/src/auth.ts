/**
 * Shared auth from the CLI side. Auth is a single machine-shared session
 * (config.AUTH_TOKEN_PATH); either the app or the CLI can establish it, and the
 * daemon's loopback port is the shared receiver.
 *
 * `signIn` creates a short-lived device code, opens the app's auth page with that code,
 * and polls Convex until the signed-in browser approves it. The browser still performs
 * the supported Convex Auth flow (GitHub or email/password); the CLI only receives the
 * resulting Convex Auth bearer token after the code is approved.
 */

import { spawn } from "node:child_process";
import { randomBytes, randomUUID, webcrypto } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { cliAuthUrl, readToken, resolveConvexUrl, writeToken } from "./config.js";
import { pingDaemon, spawnDaemon } from "./daemonControl.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const createDeviceAuth = makeFunctionReference<"mutation">("deviceAuth:create");
const pollDeviceAuth = makeFunctionReference<"mutation">("deviceAuth:poll");

interface EncryptedToken {
  encryptedKey: string;
  iv: string;
  ciphertext: string;
}

function userCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

function b64ToBytes(value: string): Uint8Array {
  return Buffer.from(value, "base64");
}

async function createDeviceKeyPair(): Promise<{
  publicKeyJwk: string;
  privateKey: webcrypto.CryptoKey;
}> {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
  return { publicKeyJwk: JSON.stringify(publicJwk), privateKey: keyPair.privateKey };
}

async function decryptToken(payload: EncryptedToken, privateKey: webcrypto.CryptoKey): Promise<string> {
  const rawKey = await webcrypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    b64ToBytes(payload.encryptedKey),
  );
  const key = await webcrypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(payload.iv) },
    key,
    b64ToBytes(payload.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
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

  const client = new ConvexHttpClient(resolveConvexUrl());
  const deviceId = randomUUID();
  const code = userCode();
  const { publicKeyJwk, privateKey } = await createDeviceKeyPair();
  await client.mutation(createDeviceAuth, { deviceId, userCode: code, publicKeyJwk });

  const authUrl = cliAuthUrl(code);
  console.log(`\nOpening ${authUrl} to sign in (GitHub or email + password)…`);
  console.log(`Your device code is ${code}.`);
  console.log(
    "If it doesn't open, visit that URL manually. Waiting for sign-in… (Ctrl-C to cancel)",
  );
  openBrowser(authUrl);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(1500);
    const res = (await client.mutation(pollDeviceAuth, { deviceId })) as
      | { status: "approved"; encryptedToken: EncryptedToken }
      | { status: "pending" | "expired" | "consumed" | "not_found" };
    if (res.status === "approved") {
      writeToken(await decryptToken(res.encryptedToken, privateKey));
      console.log(
        "✓ Signed in — shared session established for the app, CLI, and daemon.",
      );
      return;
    }
    if (res.status === "expired") break;
  }
  console.log(
    "Timed out waiting for sign-in. Re-run `agent-idle setup` once you've signed in.",
  );
}
