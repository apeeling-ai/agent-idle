/**
 * `agent-idle ui` — launch the desktop app. STUB: spawns `tauri dev` (needs Rust). TODO:
 * focus an already-running instance instead of launching a second one, and launch the
 * built bundle in production rather than the dev server.
 */

import { spawn } from "node:child_process";

export function ui(): void {
  console.log("Launching Agent Idle app (tauri dev)…");
  const child = spawn("pnpm", ["--filter", "@agent-idle/app", "tauri", "dev"], {
    stdio: "inherit",
  });
  child.on("error", () => {
    console.log(
      "Could not launch automatically. Run `pnpm --filter @agent-idle/app tauri dev` " +
        "(requires the Rust/Tauri prerequisites).",
    );
  });
}
