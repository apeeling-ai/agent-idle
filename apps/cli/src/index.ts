#!/usr/bin/env node
/**
 * agent-idle CLI dispatcher. Four commands you run, two the agent runs.
 *   setup [claude] [codex] — register the hook(s) + sign in (interactive multi-select if no arg)
 *   status               — show daemon / sign-in / hooks / queued events / live sessions
 *   remove               — uninstall the hooks and clear the shared session
 *   kill                 — stop the running sensor daemon
 *   daemon               — internal: the headless sensor (HTTP listener + outbox flusher)
 *   hook [claude|codex]  — internal: invoked by an agent, forwards the payload to the daemon
 */

import { startDaemon } from "./daemon.js";
import { runHook } from "./hook.js";
import { kill } from "./kill.js";
import { remove } from "./remove.js";
import { setup } from "./setup.js";
import { status } from "./status.js";

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "setup":
    await setup(process.argv.slice(3));
    break;
  case "status":
    await status();
    break;
  case "remove":
    remove();
    break;
  case "kill":
    await kill();
    break;
  case "daemon":
    startDaemon();
    break;
  case "hook":
    await runHook(arg);
    process.exit(0);
    break;
  default:
    console.log("Usage: agent-idle <setup [claude] [codex] | status | remove | kill>");
    process.exit(command ? 1 : 0);
}
