import { useEffect, useMemo, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "../convex";
import { AuthCard } from "./AuthCard";
import "./web.css";

const DEVICE_CODE_KEY = "agent-idle.deviceCode";

function storedDeviceCode(): string | null {
  try {
    return sessionStorage.getItem(DEVICE_CODE_KEY);
  } catch {
    return null;
  }
}

function readDeviceCode(): string | null {
  const code = new URLSearchParams(window.location.search).get("code");
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
