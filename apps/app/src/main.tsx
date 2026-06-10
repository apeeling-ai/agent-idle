import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { DevHarness } from "./DevHarness";
import { DevGallery } from "./DevGallery";
import { DashboardPreview } from "./dashboard/DashboardPreview";
import { convex } from "./convex";

// Dev-only routes (needs no Convex/auth):
//   ?harness — the render-seam playground (live behaviour)
//   ?gallery — the asset & component browser (all bodies/animations/zones/sounds)
//   ?dash    — the stats dashboard fed synthetic data (design/screenshot without a backend)
const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null;
const harness = params?.has("harness") ?? false;
const gallery = params?.has("gallery") ?? false;
const dash = params?.has("dash") ?? false;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {dash ? (
      <DashboardPreview />
    ) : gallery ? (
      <DevGallery />
    ) : harness ? (
      <DevHarness />
    ) : (
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    )}
  </React.StrictMode>,
);
