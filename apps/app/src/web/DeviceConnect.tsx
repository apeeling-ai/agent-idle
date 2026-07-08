import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../convex";
import { AuthCard } from "./AuthCard";
import "./web.css";

const DEVICE_CODE_KEY = "agent-idle.deviceCode";

/**
 * Shape of a device user-code (5 random bytes, uppercase hex — see the CLI/app `userCode()`).
 * Convex Auth's OAuth flow ALSO uses a `?code=` query param (its one-time sign-in verifier), so
 * this regex is what distinguishes "device code to approve" from "auth code to redeem": anything
 * that doesn't match must be left for ConvexAuthProvider (see `shouldHandleCode` in main.tsx).
 */
export const DEVICE_CODE_RE = /^[0-9A-F]{10}$/;

function storedDeviceCode(): string | null {
  try {
    return sessionStorage.getItem(DEVICE_CODE_KEY);
  } catch {
    return null;
  }
}

function readDeviceCode(): string | null {
  // `user_code` is the collision-free param newer CLIs/apps send; `code` is kept for links from
  // older CLIs but only honored when it LOOKS like a device code — after a GitHub OAuth round-trip
  // the URL carries Convex Auth's own `?code=<verifier>`, which must not clobber the stored code.
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("user_code") ?? params.get("code");
  const code = raw && DEVICE_CODE_RE.test(raw) ? raw : null;
  if (code) {
    try {
      sessionStorage.setItem(DEVICE_CODE_KEY, code);
    } catch {
      /* storage can be unavailable in locked-down browsers */
    }
    return code;
  }
  return storedDeviceCode();
}

function clearDeviceCode(code: string): void {
  try {
    if (sessionStorage.getItem(DEVICE_CODE_KEY) === code) {
      sessionStorage.removeItem(DEVICE_CODE_KEY);
    }
  } catch {
    /* storage can be unavailable in locked-down browsers */
  }
}

/**
 * The page a machine (CLI or desktop app) opens to authorize itself. The user signs in here with
 * the normal Convex Auth flow (GitHub or email + password) — this browser keeps its own session —
 * and we simply APPROVE the device code. The machine then completes its own sign-in on its side
 * (see convex/deviceAuth.ts); no token ever passes through this page.
 */
export function DeviceConnect() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const approveDevice = useMutation(api.deviceAuth.approve);
  const [approved, setApproved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const deviceCode = useMemo(() => readDeviceCode(), []);

  useEffect(() => {
    document.documentElement.classList.add("web");
    return () => document.documentElement.classList.remove("web");
  }, []);

  useEffect(() => {
    if (!deviceCode || !isAuthenticated || approved || failed) return;
    let cancelled = false;
    void approveDevice({ userCode: deviceCode })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          clearDeviceCode(deviceCode);
          setApproved(true);
        } else {
          setFailed("This device code is expired or invalid. Re-run setup on your machine.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Could not connect this machine. Re-run setup and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [approveDevice, approved, deviceCode, failed, isAuthenticated]);

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
        <h1 className="hero__title">Agent Idle</h1>
        {!deviceCode ? (
          <p className="hero__lede">No device code found. Re-run setup on your machine.</p>
        ) : approved ? (
          <p className="hero__lede">Machine connected. You can return to your terminal.</p>
        ) : failed ? (
          <p className="hero__lede">{failed}</p>
        ) : isAuthenticated ? (
          <p className="hero__lede">Finishing connection for code {deviceCode}...</p>
        ) : (
          <AuthCard cliLogin redirectTo="/device" />
        )}
      </section>
    </main>
  );
}
