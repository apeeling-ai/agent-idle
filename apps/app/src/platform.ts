/**
 * Runtime split: the same React bundle serves two very different shells.
 *  - In the Tauri native window it's the frameless ambient overlay (App.tsx).
 *  - In a plain browser tab it's the full web experience (web/WebApp.tsx) — a real
 *    landing page + a framed, scrollable app.
 *
 * `isTauri()` is the one switch that decides which. Keep it tiny and dependency-free so
 * either shell can call it before anything else mounts.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
