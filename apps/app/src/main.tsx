import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { WebApp } from "./web/WebApp";
import { Home } from "./web/Home";
import { isTauri } from "./platform";
import { DevHarness } from "./DevHarness";
import { DevGallery } from "./DevGallery";
import { DashboardPreview } from "./dashboard/DashboardPreview";
import { convex } from "./convex";
import "./theme.css";
import "./web/web.css";

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

// The same bundle is two products: the frameless ambient overlay inside the Tauri window, and
// the full web experience (landing page + framed app) in a plain browser tab.
const Shell = isTauri() ? App : WebApp;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {dash ? (
      <DashboardPreview />
    ) : gallery ? (
      <DevGallery />
    ) : harness ? (
      <DevHarness />
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
