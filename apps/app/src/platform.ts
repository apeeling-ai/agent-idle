/**
 * Runtime split: the same React bundle serves three different shells.
 *  - In the Tauri DESKTOP window it's the frameless ambient overlay (App.tsx).
 *  - In a Tauri MOBILE (iOS/Android) webview it's the full-screen companion (mobile/MobileApp.tsx).
 *  - In a plain browser tab it's the full web experience (web/WebApp.tsx) — a real
 *    landing page + a framed, scrollable app.
 *
 * `isTauri()` decides native-vs-browser; `isMobile()` splits the native shell into the
 * desktop overlay vs the touch companion. Keep these tiny and dependency-free so any shell
 * can call them before anything else mounts.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Touch-platform check, from the webview user-agent. On Tauri mobile the host is WKWebView
 * (iOS) / Android System WebView, whose UA still carries the iPhone/iPad/Android tokens. Used
 * only to pick the shell — never for security or layout math (use CSS/visualViewport for that).
 */
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS ≥13 reports a desktop "Macintosh" UA but is the only Mac with a touch screen.
  const iPadOS = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return /iPhone|iPad|iPod|Android/i.test(ua) || iPadOS;
}

/** True only inside a Tauri native shell running on a phone/tablet (the MobileApp surface). */
export function isTauriMobile(): boolean {
  return isTauri() && isMobile();
}
