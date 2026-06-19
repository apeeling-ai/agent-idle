/**
 * Cross-platform process introspection for session liveness. Designed to add NO subprocess
 * to the hot path: existence is checked with signal 0 (no spawn, works on every OS); the
 * start-time identity token is best-effort and only used as a PID-reuse guard.
 */

import { execFileSync } from "node:child_process";

/**
 * True if a process with this pid currently exists. `process.kill(pid, 0)` sends no signal —
 * it only probes: it throws `ESRCH` when the process is gone and `EPERM` when the process
 * exists but we lack permission to signal it (still alive). Cross-platform (POSIX + Windows).
 */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

/**
 * Process start time, used as an identity token alongside the pid so a recycled pid (a
 * different process reusing the number) reads as a DIFFERENT process. POSIX: `ps -o lstart=`.
 * On Windows (and anywhere `ps` is unavailable) returns "" — there is no cheap *synchronous*
 * source, and we refuse to spawn PowerShell on the 5s poll. Callers MUST treat "" as
 * "unknown" (keep the process), never as "gone".
 */
export function processStartTime(pid: number): string {
  if (process.platform === "win32") return "";
  try {
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 500,
    }).trim();
  } catch {
    return ""; // no such process, or no `ps` — caller pairs this with processAlive()
  }
}
