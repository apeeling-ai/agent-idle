/**
 * `agent-idle setup [claude|codex]` — the one onboarding command. It (1) picks the agent
 * (interactive menu, or the positional arg to skip the prompt), (2) registers that agent's
 * hook that feeds the local daemon, printing exactly what it writes + the privacy guarantee,
 * then (3) signs you in (browser → shared session). `agent-idle remove` is the inverse.
 *
 * Claude Code and Codex use the same hook events and the same stdin-JSON payload, so
 * one daemon serves both; setup just writes the agent-specific hook config and passes the
 * agent through to the hook command (`agent-idle hook <agent>`).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { signIn } from "./auth.js";
import { type Agent, CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH, ensureDir, parseAgent } from "./config.js";

// The important Claude Code hooks for pet behavior — every one drives a state (see daemon.ts):
//   SessionStart      → spawn/wake the pet when the agent opens
//   UserPromptSubmit  → start the turn (working), appraise the prompt
//   PreToolUse/PostToolUse → renew working AND pick the job (room) from the tool name
//   PostToolUseFailure→ a tool failed; keep the pet at its job
//   PermissionRequest / Elicitation → the agent is blocked on you → alert (!) bubble
//   PermissionDenied / ElicitationResult → ask resolved → drop the bubble
//   Notification      → idle-wait (?) / fallback permission (!) bubble
//   SubagentStart/PostCompact → keep the pet busy (sub-agent running / compaction done)
//   SubagentStop      → keep the pet busy while a sub-agent finishes
//   PreCompact        → keep the pet busy through context compaction
//   Stop / StopFailure→ end the turn (idle); Stop also credits tokens
//   SessionEnd        → the clean "agent is gone" signal — force idle
// (The other ~13 Claude Code hooks — FileChanged, CwdChanged, MessageDisplay, … — don't map
//  to a pet state, so we don't register them.)
const CLAUDE_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "Elicitation",
  "ElicitationResult",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "StopFailure",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
] as const;

// Codex CLI uses the SAME hook mechanism (stdin JSON, same payload fields), but supports only
// this 10-event subset (it has no Notification / Elicitation / *Failure / PermissionDenied /
// SessionEnd). Writing Claude-only names into Codex's config could trip its validation, so we
// register only what Codex actually fires. The daemon handles all of these agent-agnostically.
const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Stop",
] as const;

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

/** Merge our hooks into Claude Code's `~/.claude/settings.json`. */
function setupClaude(command: string): void {
  const settings: Record<string, unknown> = existsSync(CLAUDE_SETTINGS_PATH)
    ? (JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf8")) as Record<string, unknown>)
    : {};

  const hooks = (settings.hooks as Record<string, unknown>) ?? {};
  for (const event of CLAUDE_HOOK_EVENTS) {
    hooks[event] = [{ hooks: [{ type: "command", command }] }];
  }
  settings.hooks = hooks;

  ensureDir(CLAUDE_SETTINGS_PATH);
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");

  console.log(`
✓ Registered Claude Code hook
    file:   ${CLAUDE_SETTINGS_PATH}
    events: ${CLAUDE_HOOK_EVENTS.join(", ")}
    cmd:    ${command}
${privacyAndNext()}`);
}

/** Merge our hooks into Codex's `~/.codex/hooks.json` (a discovery location). */
function setupCodex(command: string): void {
  const config: Record<string, unknown> = existsSync(CODEX_HOOKS_PATH)
    ? (JSON.parse(readFileSync(CODEX_HOOKS_PATH, "utf8")) as Record<string, unknown>)
    : {};

  const hooks = (config.hooks as Record<string, unknown>) ?? {};
  for (const event of CODEX_HOOK_EVENTS) {
    hooks[event] = [{ hooks: [{ type: "command", command }] }];
  }
  config.hooks = hooks;

  ensureDir(CODEX_HOOKS_PATH);
  writeFileSync(CODEX_HOOKS_PATH, JSON.stringify(config, null, 2) + "\n");

  console.log(`
✓ Registered Codex hook
    file:   ${CODEX_HOOKS_PATH}
    events: ${CODEX_HOOK_EVENTS.join(", ")}
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

  (advanced: \`agent-idle daemon\` runs the sensor in the foreground for debugging.)
`;
}

/** Interactive agent picker — shown only when `setup` is run with no positional arg. */
async function promptAgent(): Promise<Agent> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Which coding agent should feed Agent Idle?");
    console.log("  1) Claude Code");
    console.log("  2) Codex");
    const answer = (await rl.question("Choose [1]: ")).trim().toLowerCase();
    return answer === "2" || answer === "codex" ? "codex" : "claude";
  } finally {
    rl.close();
  }
}

export async function setup(agentArg: string | undefined): Promise<void> {
  requireNode22();
  // Positional arg skips the prompt (`setup codex`); otherwise pick interactively.
  const agent = agentArg ? parseAgent(agentArg) : await promptAgent();
  const command = hookCommand(agent);
  if (agent === "codex") setupCodex(command);
  else setupClaude(command);
  // Second half of onboarding: establish the shared session (browser sign-in).
  await signIn();
}
