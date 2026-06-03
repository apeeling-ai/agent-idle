#!/usr/bin/env node
/**
 * agent-idle CLI dispatcher.
 *   setup   — register the Claude Code hook
 *   login   — establish the shared session (GitHub via Convex Auth, in the browser)
 *   logout  — clear the shared session for all surfaces
 *   daemon  — run the headless sensor (HTTP listener + outbox flusher)
 *   ui      — launch the desktop app
 *   hook    — internal: invoked by Claude Code, forwards the payload to the daemon
 */

import { login, logout } from "./auth.js";
import { startDaemon } from "./daemon.js";
import { runHook } from "./hook.js";
import { setup } from "./setup.js";
import { ui } from "./ui.js";

const command = process.argv[2];

switch (command) {
  case "setup":
    setup();
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
    await runHook();
    process.exit(0);
    break;
  default:
    console.log("Usage: agent-idle <setup|login|logout|daemon|ui|hook>");
    process.exit(command ? 1 : 0);
}
