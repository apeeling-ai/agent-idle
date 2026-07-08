/**
 * The hook entrypoint (`agent-idle hook [claude|codex]`). MUST be fire-and-forget: it
 * reads the hook payload from stdin, POSTs it to the local daemon, writes nothing to
 * stdout, swallows all errors, and exits 0 — never blocking a turn.
 *
 * Claude Code and Codex both use the same hook event names and stdin-JSON payload, so the
 * one binary serves both. The agent arg (default "claude") rides along as `?agent=` so the
 * daemon can tag provenance and pick the right transcript parser.
 *
 * The daemon is AUTOMATIC: if it isn't running, the hook spawns it (detached) and retries
 * once. Steady state (daemon already up) is a single fast POST; only the rare cold start
 * pays a short wait while the daemon binds.
 */

import { execFileSync } from "node:child_process";
import { DAEMON_URL, parseAgent } from "./config.js";
import { buildFingerprint, spawnDaemon } from "./daemonControl.js";

// Shell wrappers to skip when finding the owning agent process. Claude Code runs a
// `type:"command"` hook through a shell (so our parent is e.g. `sh`/`zsh`); the real,
// long-lived `claude` process is the first NON-shell ancestor above that wrapper. (If a
// future exec-form hook spawns us directly, our parent already IS claude — depth-1.)
const SHELL_COMMS = new Set([
  "sh", "bash", "zsh", "dash", "fish", "ksh", "tcsh", "csh",
  "-sh", "-bash", "-zsh", "-dash", "-fish", "-ksh", "-tcsh", "-csh",
]);

/** One `ps` field for a pid; "" on any failure (process gone / no ps / Windows). */
function psField(pid: number, field: "ppid" | "comm" | "lstart"): string {
  try {
    return execFileSync("ps", ["-o", `${field}=`, "-p", String(pid)], {
      encoding: "utf8",
      timeout: 500,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Resolve the owning `claude` process: walk up from our parent, skipping the shell wrapper,
 * to the first non-shell ancestor. Returns its pid + start time (an identity tuple — the
 * daemon polls the pid for liveness and re-checks the start time to defeat PID reuse). Null
 * if it can't be resolved (e.g. `ps` unavailable) → the session just relies on decay.
 */
function resolveAgentProcess(): { pid: number; start: string } | null {
  let pid = process.ppid;
  for (let hop = 0; hop < 5 && pid > 1; hop++) {
    const comm = psField(pid, "comm");
    if (!comm) return null; // process already gone / no ps
    const base = comm.split("/").pop() ?? comm;
    if (!SHELL_COMMS.has(base)) {
      const start = psField(pid, "lstart");
      return start ? { pid, start } : null;
    }
    const ppid = Number.parseInt(psField(pid, "ppid"), 10);
    if (!Number.isFinite(ppid) || ppid <= 1) return null;
    pid = ppid;
  }
  return null;
}

/**
 * A human-friendly name for THIS terminal/instance, read from the env the hook inherits (the
 * daemon can't see it — it's a separate long-lived process). Set `AGENT_IDLE_LABEL` in a shell
 * to name an instance yourself (e.g. `export AGENT_IDLE_LABEL=backend`); otherwise we fall back
 * to the terminal app. Stays local — it rides to the loopback daemon only, for the pet's label.
 */
function terminalName(): string {
  const e = process.env;
  return (
    e.AGENT_IDLE_LABEL ||
    e.TERM_PROGRAM ||
    e.WT_SESSION ||
    (e.TMUX_PANE ? `tmux ${e.TMUX_PANE}` : "") ||
    e.TERM ||
    ""
  );
}

/**
 * Tag the hook payload with LOCAL hints before forwarding to the daemon. Always: the terminal
 * name. On the session-registration events (SessionStart / UserPromptSubmit) ALSO: the owning
 * `claude` process identity, so the daemon can poll it and detect a hard kill (terminal closed /
 * SIGKILL) the moment the process disappears, rather than waiting out passive decay. We resolve
 * it only on those (infrequent) events to keep the per-tool hook trivial. Never throws —
 * non-JSON or any error forwards the body untouched. */
function tagPayload(body: string): string {
  try {
    const obj = JSON.parse(body) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") return body;
    if (!obj.terminal) obj.terminal = terminalName();
    const event = obj.hook_event_name;
    if ((event === "SessionStart" || event === "UserPromptSubmit") && !obj.agentPid) {
      const proc = resolveAgentProcess();
      if (proc) {
        obj.agentPid = proc.pid;
        obj.agentStart = proc.start;
      }
    }
    return JSON.stringify(obj);
  } catch {
    return body;
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c: Buffer) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", () => resolve(""));
  });
}

async function postToDaemon(url: string, body: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Stale-daemon guard: the hook is spawned fresh per event, so this mtime always
        // reflects the build ON DISK. A daemon seeing a newer caller retires itself and
        // the next hook respawns the new build — no manual `kill` after updates.
        "x-agent-idle-build": String(buildFingerprint().mtimeMs),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false; // daemon down / timeout
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runHook(agentArg: string | undefined): Promise<void> {
  const url = `${DAEMON_URL}/hook?agent=${parseAgent(agentArg)}`;
  let body = "{}";
  try {
    body = (await readStdin()) || "{}";
  } catch {
    /* ignore */
  }
  body = tagPayload(body); // tag with the local terminal name (+ agent pid on session start)

  if (await postToDaemon(url, body)) return;

  // Daemon wasn't running → start it automatically, then retry once it has bound.
  spawnDaemon();
  await sleep(600);
  await postToDaemon(url, body); // best-effort; if still starting, this event is skipped (next works)
}
