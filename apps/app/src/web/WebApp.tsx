/**
 * Browser shell root. Picks the landing page (signed out) or the framed app (signed in), and
 * tags <html> with `.web` so web.css can override App.css's transparent/frameless rules (which
 * exist for the Tauri overlay) with a solid, scrollable page.
 */

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../convex";
import { Home } from "./Home";
import { WebShell } from "./WebShell";
import "../theme.css";
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
  if (typeof window === "undefined") return null;
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

/** `agent-idle login` opens this page to connect a machine; the param lets us jump straight to
 * sign-in and confirm the connection afterwards. */
function isCliLogin(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  return q.has("login") || q.has("cli") || Boolean(storedCliDeviceCode());
}

export function WebApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const token = useAuthToken();
  const approveDevice = useMutation(api.deviceAuth.approve);
  const getDevicePublicKey = useMutation(api.deviceAuth.getPublicKey);
  const cliLogin = isCliLogin();
  const [deviceCode] = useState(() => readCliDeviceCode());
  const [approvedCode, setApprovedCode] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("web");
    return () => document.documentElement.classList.remove("web");
  }, []);

  useEffect(() => {
    if (!deviceCode || !token || approvedCode === deviceCode) return;
    let cancelled = false;
    void getDevicePublicKey({ userCode: deviceCode })
      .then(async (key) => {
        if (!key.ok) return { ok: false };
        const encryptedToken = await encryptToken(token, key.publicKeyJwk);
        return approveDevice({ userCode: deviceCode, encryptedToken });
      })
      .then((res) => {
        if (!cancelled && res?.ok) {
          clearCliDeviceCode(deviceCode);
          setApprovedCode(deviceCode);
        }
      })
      .catch(() => {
        /* the CLI poll will time out if the code is invalid or expired */
      });
    return () => {
      cancelled = true;
    };
  }, [approveDevice, approvedCode, deviceCode, getDevicePublicKey, token]);

  if (isLoading) {
    return (
      <div className="web-boot">
        <span className="wordmark">
          <span className="wordmark__glyph" aria-hidden>✥</span>
          <span className="wordmark__text">Agent&nbsp;Idle</span>
        </span>
      </div>
    );
  }

  return isAuthenticated ? (
    <WebShell cliLogin={cliLogin} deviceConnected={!deviceCode || approvedCode === deviceCode} />
  ) : (
    <Home cliLogin={cliLogin} />
  );
}
