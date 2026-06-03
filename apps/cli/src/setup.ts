/**
 * `agent-idle setup [codex]` — lightweight. Auth moved to Convex Auth (you sign in via the
 * app), so setup only registers the agent's hook that feeds the local daemon, and prints
 * exactly what it writes + the privacy guarantee.
 *
 * Claude Code and Codex use the same four hook events and the same stdin-JSON payload, so
 * one daemon serves both; setup just writes the agent-specific hook config and passes the
 * agent through to the hook command (`agent-idle hook <agent>`).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Agent, CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH, ensureDir, parseAgent } from "./config.js";

// UserPromptSubmit/Stop bracket a turn; PreToolUse/PostToolUse renew the "working"
// window during it so a Ctrl-C interrupt (no Stop fires) lapses the pet to idle.
const HOOK_EVENTS = ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"] as const;

function hookCommand(agent: Agent): string {
  // dist/index.js is the bin; this file compiles to dist/setup.js (sibling). Claude omits
  // the agent arg (default), Codex passes it so the daemon tags provenance + parser.
  // process.execPath (the Node that ran setup) is FROZEN into the hook command, so the
  // hook — and the daemon it auto-spawns — always run under this exact Node, regardless
  // of the shell's active nvm version when the agent later fires the hook.
  const indexPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const base = `${process.execPath} ${indexPath} hook`;
  return agent === "codex" ? `${base} codex` : base;
}

/**
 * Refuse to write hooks under Node < 22. The running Node's path is baked into the hook
 * command, so running setup on the system-default Node 20 would silently freeze a Node 20
 * path into a persistent hook and break the sensor (the engine/CLI require Node ≥ 22).
 */
function requireNode22(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 22) return;
  console.error(`
✗ agent-idle setup needs Node ≥ 22 — you're on Node ${process.versions.node} (${process.execPath}).

  The hook command bakes in THIS Node binary, so installing now would freeze the wrong
  version into your agent's hook config. Switch first, then re-run:

    nvm use 22 && agent-idle setup${process.argv[3] ? ` ${process.argv[3]}` : ""}
`);
  process.exit(1);
}

/** Merge our four hooks into Claude Code's `~/.claude/settings.json`. */
function setupClaude(command: string): void {
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
${privacyAndNext()}`);
}

/** Merge our four hooks into Codex's `~/.codex/hooks.json` (a discovery location). */
function setupCodex(command: string): void {
  const config: Record<string, unknown> = existsSync(CODEX_HOOKS_PATH)
    ? (JSON.parse(readFileSync(CODEX_HOOKS_PATH, "utf8")) as Record<string, unknown>)
    : {};

  const hooks = (config.hooks as Record<string, unknown>) ?? {};
  for (const event of HOOK_EVENTS) {
    hooks[event] = [{ hooks: [{ type: "command", command }] }];
  }
  config.hooks = hooks;

  ensureDir(CODEX_HOOKS_PATH);
  writeFileSync(CODEX_HOOKS_PATH, JSON.stringify(config, null, 2) + "\n");

  console.log(`
✓ Registered Codex hook
    file:   ${CODEX_HOOKS_PATH}
    events: ${HOOK_EVENTS.join(", ")}
    cmd:    ${command}

  ⚠ Codex requires you to TRUST a newly-installed command hook before it runs:
    open Codex and run  /hooks  → review and trust the agent-idle hook.
${privacyAndNext()}`);
}

function privacyAndNext(): string {
  return `
  PRIVACY: the daemon appraises your prompts LOCALLY to compute a coarse numeric
  quality score. It sends COUNTS + that score to the server — never your prompt text
  or source code. Nothing is written to any dotfile except the hook config above.

  The sensor daemon starts AUTOMATICALLY the first time a hook fires (and stays
  running). You don't need to start it by hand. The SAME daemon serves both Claude
  Code and Codex.

  Next:
    agent-idle ui            # launch the app and sign in with GitHub
                             # (the app shares its auth token so events post as you)

  (advanced: \`agent-idle daemon\` runs the sensor in the foreground for debugging.)
`;
}

export function setup(agentArg: string | undefined): void {
  requireNode22();
  const agent = parseAgent(agentArg);
  const command = hookCommand(agent);
  if (agent === "codex") setupCodex(command);
  else setupClaude(command);
}
