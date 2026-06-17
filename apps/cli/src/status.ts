/**
 * `agent-idle status` — a quick read-only health check: is the sensor daemon running, are you
 * signed in, which agents' hooks are installed, how many events are queued, and (if the daemon
 * is up) the live sessions it's tracking. Touches nothing — safe to run anytime.
 */

import { CLAUDE_SETTINGS_PATH, CODEX_HOOKS_PATH, DAEMON_PORT, DAEMON_URL, readToken } from "./config.js";
import { pingDaemon } from "./daemonControl.js";
import { countInstalledEvents } from "./hooks.js";
import { readOutbox } from "./outbox.js";

interface SessionMeta {
  repo?: string;
  topic?: string;
  terminal?: string;
}

/** Read the daemon's local-only session hints over loopback (Node caller — no Origin header). */
async function fetchSessions(): Promise<Record<string, SessionMeta> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`${DAEMON_URL}/sessions`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, SessionMeta>;
  } catch {
    return null;
  }
}

export async function status(): Promise<void> {
  const running = await pingDaemon();
  const signedIn = Boolean(readToken());
  const claude = countInstalledEvents(CLAUDE_SETTINGS_PATH);
  const codex = countInstalledEvents(CODEX_HOOKS_PATH);
  const queued = readOutbox().length;

  const lines = [
    `Daemon:   ${running ? `running on 127.0.0.1:${DAEMON_PORT}` : "not running (a hook will auto-start it)"}`,
    `Session:  ${signedIn ? "signed in" : "not signed in — run `agent-idle setup`"}`,
    `Hooks:    Claude Code ${claude ? `✓ (${claude} events)` : "✗ not installed"}` +
      `   ·   Codex ${codex ? `✓ (${codex} events)` : "✗ not installed"}`,
    `Outbox:   ${queued} event(s) queued${queued && !signedIn ? " (waiting for sign-in)" : ""}`,
  ];

  if (running) {
    const sessions = await fetchSessions();
    const ids = sessions ? Object.keys(sessions) : [];
    if (ids.length === 0) {
      lines.push("Active:   no live sessions");
    } else {
      lines.push(`Active:   ${ids.length} session(s)`);
      for (const id of ids) {
        const m = sessions?.[id] ?? {};
        const label = [m.repo, m.topic].filter(Boolean).join(" · ") || "—";
        const term = m.terminal ? `  (${m.terminal})` : "";
        lines.push(`            ${id.slice(0, 8)}  ${label}${term}`);
      }
    }
  }

  console.log(`\n${lines.join("\n")}\n`);
}
