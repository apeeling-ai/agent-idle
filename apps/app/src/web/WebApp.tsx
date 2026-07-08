/**
 * Browser shell root. Picks the landing page (signed out) or the framed app (signed in), and
 * tags <html> with `.web` so web.css can override App.css's transparent/frameless rules (which
 * exist for the Tauri overlay) with a solid, scrollable page.
 */

import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { Home } from "./Home";
import { WebShell } from "./WebShell";
import "../theme.css";
import "./web.css";

export function WebApp() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  useEffect(() => {
    document.documentElement.classList.add("web");
    return () => document.documentElement.classList.remove("web");
  }, []);

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

  return isAuthenticated ? <WebShell /> : <Home />;
}
