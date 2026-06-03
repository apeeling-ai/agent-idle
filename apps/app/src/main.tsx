import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { DevHarness } from "./DevHarness";
import { convex } from "./convex";

// Dev-only render-seam playground: open with `?harness` in `pnpm dev`. Needs no Convex/auth.
const harness = import.meta.env.DEV && new URLSearchParams(window.location.search).has("harness");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {harness ? (
      <DevHarness />
    ) : (
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    )}
  </React.StrictMode>,
);
