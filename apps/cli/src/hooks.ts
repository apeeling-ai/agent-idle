/**
 * Shared detection of the hook entries `setup` writes into an agent's JSON config. Used by
 * `remove` (to strip them) and `status` (to report them) so both agree on what "ours" means.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Absolute path to this CLI's `dist/index.js` — the bin baked into every hook we write. */
export function ourBinPath(): string {
  return fileURLToPath(new URL("./index.js", import.meta.url));
}

/** True if a hook config entry is one we installed (its command runs our `hook` subcommand). */
export function isOurEntry(entry: unknown, binPath: string): boolean {
  const inner = (entry as { hooks?: unknown })?.hooks;
  if (!Array.isArray(inner)) return false;
  return inner.some((h) => {
    const cmd = (h as { command?: unknown })?.command;
    if (typeof cmd !== "string") return false;
    // Match the exact bin path we baked in, or — if installed under a different path —
    // any "agent-idle … hook" command. (Our own command always satisfies the first.)
    return cmd.includes(binPath) || (cmd.includes("agent-idle") && /\bhook\b/.test(cmd));
  });
}

/** Count the hook events in an agent's JSON config that carry our entry (read-only). 0 if the
 * file is absent / unparseable / has none of our entries. */
export function countInstalledEvents(path: string): number {
  if (!existsSync(path)) return 0;
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return 0;
  }
  const hooks = config.hooks as Record<string, unknown> | undefined;
  if (!hooks || typeof hooks !== "object") return 0;
  const binPath = ourBinPath();
  let count = 0;
  for (const event of Object.keys(hooks)) {
    const arr = hooks[event];
    if (Array.isArray(arr) && arr.some((entry) => isOurEntry(entry, binPath))) count++;
  }
  return count;
}
