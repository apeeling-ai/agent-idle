#!/usr/bin/env node
/**
 * agent-idle CLI dispatcher.
 *   setup [codex] — register the hook (Claude Code by default, or Codex)
 *   login         — establish the shared session (GitHub via Convex Auth, in the browser)
 *   logout        — clear the shared session for all surfaces
 *   daemon        — run the headless sensor (HTTP listener + outbox flusher)
 *   ui            — launch the desktop app
 *   hook [codex]  — internal: invoked by an agent, forwards the payload to the daemon
 */

import { login, logout } from "./auth.js";
import { startDaemon } from "./daemon.js";
import { runHook } from "./hook.js";
import { setup } from "./setup.js";
import { ui } from "./ui.js";

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "setup":
    setup(arg);
    break;
  case "login":
    await login();
    break;
  case "logout":
    logout();
    break;
  case "daemon":
    startDaemon();
    break;
  case "ui":
    ui();
    break;
  case "hook":
    await runHook(arg);
    process.exit(0);
    break;
  default:
    console.log("Usage: agent-idle <setup [codex]|login|logout|daemon|ui|hook>");
    process.exit(command ? 1 : 0);
}
