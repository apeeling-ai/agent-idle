/**
 * `agent-idle setup` — now lightweight. Auth moved to Convex Auth (you sign in via the
 * app), so setup only registers the Claude Code hook that feeds the local daemon, and
 * prints exactly what it writes + the privacy guarantee.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CLAUDE_SETTINGS_PATH, ensureDir } from "./config.js";

const HOOK_EVENTS = ["UserPromptSubmit", "Stop"] as const;

function hookCommand(): string {
  // dist/index.js is the bin; this file compiles to dist/setup.js (sibling).
  const indexPath = fileURLToPath(new URL("./index.js", import.meta.url));
  return `${process.execPath} ${indexPath} hook`;
}

export function setup(): void {
  const command = hookCommand();
  const settings: Record<string, unknown> = existsSync(CLAUDE_SETTINGS_PATH)
    ? (JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf8")) as Record<string, unknown>)
    : {};

  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  for (const event of HOOK_EVENTS) {
    hooks[event] = [{ hooks: [{ type: "command", command }] }];
  }
  settings.hooks = hooks;

  ensureDir(CLAUDE_SETTINGS_PATH);
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");

  console.log(`
✓ Registered Claude Code hook
    file:   ${CLAUDE_SETTINGS_PATH}
    events: ${HOOK_EVENTS.join(", ")}
    cmd:    ${command}

  PRIVACY: the daemon appraises your prompts LOCALLY to compute a coarse numeric
  quality score. It sends COUNTS + that score to the server — never your prompt text
  or source code. Nothing is written to any dotfile except the hook config above.

  The sensor daemon starts AUTOMATICALLY the first time a hook fires (and stays
  running). You don't need to start it by hand.

  Next:
    agent-idle ui            # launch the app and sign in with GitHub
                             # (the app shares its auth token so events post as you)

  (advanced: \`agent-idle daemon\` runs the sensor in the foreground for debugging.)
`);
}
