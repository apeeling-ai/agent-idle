/**
 * `agent-idle remove` — the inverse of `setup`. It (1) strips the agent-idle hook entries
 * from both Claude Code's `~/.claude/settings.json` and Codex's `~/.codex/hooks.json`
 * (leaving any of your other hooks untouched), and (2) clears the shared session token,
 * signing out every surface. Idempotent — safe to run when nothing is installed.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AUTH_TOKEN_PATH, CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH, clearToken } from "./config.js";
import { isOurEntry, ourBinPath } from "./hooks.js";

/**
 * Strip our hook entries from one agent's JSON config in place. Returns the number of hook
 * events we removed ourselves from (0 if the file is absent / has none of our entries).
 */
function stripHooks(path: string): number {
  if (!existsSync(path)) return 0;
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return 0; // unparseable — leave it alone
  }
  const hooks = config.hooks as Record<string, unknown> | undefined;
  if (!hooks || typeof hooks !== "object") return 0;

  const binPath = ourBinPath();
  let removed = 0;
  for (const event of Object.keys(hooks)) {
    const arr = hooks[event];
    if (!Array.isArray(arr)) continue;
    const kept = arr.filter((entry) => !isOurEntry(entry, binPath));
    if (kept.length === arr.length) continue;
    removed++;
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (removed === 0) return 0;

  if (Object.keys(hooks).length === 0) delete config.hooks;
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
  return removed;
}

export function remove(): void {
  const claude = stripHooks(CLAUDE_SETTINGS_PATH);
  const codex = stripHooks(CODEX_HOOKS_PATH);
  const hadToken = existsSync(AUTH_TOKEN_PATH);
  clearToken();

  console.log(`
✓ agent-idle removed
    Claude Code hooks: ${claude > 0 ? `cleared (${claude} events) — ${CLAUDE_SETTINGS_PATH}` : "none found"}
    Codex hooks:       ${codex > 0 ? `cleared (${codex} events) — ${CODEX_HOOKS_PATH}` : "none found"}
    session:           ${hadToken ? `cleared — ${AUTH_TOKEN_PATH}` : "none found"}

  The daemon stops posting on its next tick. Re-run \`agent-idle setup\` to reinstall.
`);
}
