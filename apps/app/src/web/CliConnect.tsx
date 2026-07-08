import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../convex";
import { AuthCard } from "./AuthCard";
import "./web.css";

const CLI_DEVICE_CODE_KEY = "agent-idle.cliDeviceCode";

interface EncryptedToken {
  encryptedKey: string;
  iv: string;
  ciphertext: string;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptToken(token: string, publicKeyJwk: string): Promise<EncryptedToken> {
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(publicKeyJwk) as JsonWebKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(token),
  );
  const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawKey);
  return {
    encryptedKey: bytesToB64(new Uint8Array(encryptedKey)),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ciphertext)),
  };
}

function storedCliDeviceCode(): string | null {
  try {
    return sessionStorage.getItem(CLI_DEVICE_CODE_KEY);
  } catch {
    return null;
  }
}

function readCliDeviceCode(): string | null {
  const code = new URLSearchParams(window.location.search).get("code");
  if (code) {
    try {
      sessionStorage.setItem(CLI_DEVICE_CODE_KEY, code);
    } catch {
      /* storage can be unavailable in locked-down browsers */
    }
    return code;
  }
  return storedCliDeviceCode();
}

function clearCliDeviceCode(code: string): void {
  try {
    if (sessionStorage.getItem(CLI_DEVICE_CODE_KEY) === code) {
      sessionStorage.removeItem(CLI_DEVICE_CODE_KEY);
    }
  } catch {
    /* storage can be unavailable in locked-down browsers */
  }
}

export function CliConnect() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const token = useAuthToken();
  const approveDevice = useMutation(api.deviceAuth.approve);
  const getDevicePublicKey = useMutation(api.deviceAuth.getPublicKey);
  const [approved, setApproved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const deviceCode = useMemo(() => readCliDeviceCode(), []);

  useEffect(() => {
    document.documentElement.classList.add("web");
    return () => document.documentElement.classList.remove("web");
  }, []);

  useEffect(() => {
    if (!deviceCode || !token || approved || failed) return;
    let cancelled = false;
    void getDevicePublicKey({ userCode: deviceCode })
      .then(async (key) => {
        if (!key.ok) return { ok: false as const, reason: "expired" };
        const encryptedToken = await encryptToken(token, key.publicKeyJwk);
        return approveDevice({ userCode: deviceCode, encryptedToken });
      })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          clearCliDeviceCode(deviceCode);
          setApproved(true);
        } else {
          setFailed("This device code is expired or invalid. Re-run setup in your terminal.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Could not connect this machine. Re-run setup and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [approveDevice, approved, deviceCode, failed, getDevicePublicKey, token]);

  if (isLoading) {
    return (
      <main className="web-boot">
        <span className="wordmark">
          <span className="wordmark__glyph" aria-hidden>✥</span>
          <span className="wordmark__text">Agent&nbsp;Idle</span>
        </span>
      </main>
    );
  }

  return (
    <main className="home">
      <section className="hero" style={{ minHeight: "100vh" }}>
        <p className="eyebrow eyebrow--center">Connect your machine</p>
        <h1 className="hero__title">Agent Idle CLI</h1>
        {!deviceCode ? (
          <p className="hero__lede">No device code found. Re-run setup in your terminal.</p>
        ) : approved ? (
          <p className="hero__lede">Machine connected. You can return to your terminal.</p>
        ) : failed ? (
          <p className="hero__lede">{failed}</p>
        ) : isAuthenticated ? (
          <p className="hero__lede">Finishing connection for code {deviceCode}...</p>
        ) : (
          <AuthCard cliLogin redirectTo="/cli" />
        )}
      </section>
    </main>
  );
}
