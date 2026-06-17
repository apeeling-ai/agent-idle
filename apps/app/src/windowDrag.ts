import type { MouseEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Begin a native window move from a panel's header bar. The full-window menus (character sheet,
 * stats dashboard) cover the surface with `-webkit-app-region: no-drag`, so there's nothing left
 * for the ambient DragHandle to grab — these headers stand in as the drag region instead.
 *
 * Uses Tauri's startDragging() (the same reliable path the ambient DragHandle uses — never
 * maximizes on double-click, unlike data-tauri-drag-region). Skips the drag when the press lands
 * on an interactive child (a button/tab/close control) so those clicks still register, and no-ops
 * in the dev browser.
 */
export function startHeaderDrag(e: MouseEvent) {
  if (e.button !== 0) return; // left button only
  if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  void getCurrentWindow().startDragging().catch(() => {});
}
