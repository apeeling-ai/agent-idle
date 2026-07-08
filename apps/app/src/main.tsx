import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { MobileApp } from "./mobile/MobileApp";
import { WebApp } from "./web/WebApp";
import { DEVICE_CODE_RE, DeviceConnect } from "./web/DeviceConnect";
import { Home } from "./web/Home";
import { isTauri, isTauriMobile } from "./platform";
import { DevHarness } from "./DevHarness";
import { DevGallery } from "./DevGallery";
import { DashboardPreview } from "./dashboard/DashboardPreview";
import { convex } from "./convex";
import { initAnalytics } from "./analytics";
import "./theme.css";
import "./web/web.css";

initAnalytics();

// Dev-only routes (needs no Convex/auth):
//   ?harness — the render-seam playground (live behaviour)
//   ?gallery — the asset & component browser (all bodies/animations/zones/sounds)
//   ?dash    — the stats dashboard fed synthetic data (design/screenshot without a backend)
//   ?home    — the browser landing page (design/screenshot without a backend)
const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
const harness = params?.has("harness") ?? false;
const gallery = params?.has("gallery") ?? false;
const dash = params?.has("dash") ?? false;
const home = params?.has("home") ?? false;
// The ?home preview needs the same `.web` document overrides WebApp installs at runtime.
if (home) document.documentElement.classList.add("web");

// The same bundle is three products: the frameless ambient overlay inside the Tauri desktop
// window, the full-screen touch companion inside the Tauri mobile webview, and the full web
// experience (landing page + framed app) in a plain browser tab.
const Shell = isTauriMobile() ? MobileApp : isTauri() ? App : WebApp;
const deviceConnect = !isTauri() && !isTauriMobile() && window.location.pathname === "/device";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {dash ? (
      <DashboardPreview />
    ) : gallery ? (
      <DevGallery />
    ) : harness ? (
      <DevHarness />
    ) : deviceConnect ? (
      // `shouldHandleCode` keeps ConvexAuthProvider's hands off a `?code=` that is a DEVICE code
      // (older CLIs use that param): without it the provider treats the device code as its own
      // OAuth verifier, fails the exchange, CLEARS the stored session (logging the user out), and
      // never reads the real session from storage. A non-device-shaped code (the verifier Convex
      // Auth itself appends after GitHub sign-in) is still handled normally.
      <ConvexAuthProvider
        client={convex}
        shouldHandleCode={() =>
          !DEVICE_CODE_RE.test(new URLSearchParams(window.location.search).get("code") ?? "")
        }
      >
        <DeviceConnect />
      </ConvexAuthProvider>
    ) : home ? (
      <ConvexAuthProvider client={convex}>
        <Home />
      </ConvexAuthProvider>
    ) : (
      <ConvexAuthProvider client={convex}>
        <Shell />
      </ConvexAuthProvider>
    )}
  </React.StrictMode>,
);
