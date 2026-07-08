/**
 * Sign-in panel for the ambient desktop window. Uses the browser DEVICE FLOW rather than an
 * in-webview Convex Auth form: a Tauri webview is a poor place for an OAuth redirect, so we open
 * the system browser (the real Convex Auth client), let the user sign in there with whichever
 * method they like (GitHub or email + password), and receive this app's own minted session back
 * through the device code. See deviceConnect.ts. The daemon holds its own separate machine
 * session (via `agent-idle setup`), so there is no token to push anywhere.
 */

import { useState } from "react";
import { connectViaBrowser, type ConnectStatus } from "./deviceConnect";

export function AuthPanel() {
  const [status, setStatus] = useState<ConnectStatus | "idle">("idle");
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    setError(null);
    void connectViaBrowser(setStatus).catch((e) => {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not connect. Try again.");
    });
  };

  return (
    <div className="auth">
      <button onClick={connect} disabled={status === "waiting"}>
        {status === "waiting" ? "Waiting for browser…" : "Connect this machine"}
      </button>
      <span className="hint">
        {status === "waiting"
          ? "Finish signing in in your browser, then return here."
          : "Opens your browser to sign in (GitHub or email + password)."}
      </span>
      {error && <span className="hint">{error}</span>}
    </div>
  );
}
