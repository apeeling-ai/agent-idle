/**
 * LAZY decay. The whole liveness model is a pure function of elapsed time since
 * `lastUpdated` (the last usage) — there is NO scheduled tick anywhere in the system.
 * Both the server (at event-reduce and at read) and the clients call `decay()` to
 * derive the current status identically.
 *
 * Two dimensions come out of one snapshot:
 *  - `activity` ("active" | "idle") — the working signal: was the last event a "working"
 *    one AND was it recent (within ACTIVITY.workTimeoutMs)? The freshness window is
 *    applied HERE, at read time, so a closed/interrupted session lapses to idle on its
 *    own and stale data can't keep a pet mining. Drives the mining vs resting animation.
 *  - `status` — the SLOW survival ladder read off the decayed `energy`. Auto-faint /
 *    auto-death is just the terminal rung being crossed by elapsed time; because it is
 *    derived, a pet nobody has used for a week is already "dead" the instant someone
 *    reads it — no job had to run.
 */

import { ACTIVITY, DECAY, TIME, type Mode } from "./config.js";
import { clamp01, type Resources } from "./resources.js";

export type LivenessStatus =
  | "lively"
  | "weary"
  | "drained"
  | "fainted"
  | "dead";

/** Whether the session is being used right now (drives the working animation). */
export type ActivityStatus = "active" | "idle";

/** Minimal snapshot needed to derive liveness. Both an Entity and a cached DB row satisfy this. */
export interface DecayInput {
  resources: Resources;
  /** epoch ms of the last usage (register/activity). */
  lastUpdated: number;
  /** Was the last event a "working" one? Combined with freshness ⇒ active. */
  working: boolean;
  mode: Mode;
}

export interface Liveness {
  status: LivenessStatus;
  /** Short-term usage signal — "active" when used within ACTIVITY.activeWindowMs. */
  activity: ActivityStatus;
  /** false only when a hardcore pet has crossed the terminal rung. */
  alive: boolean;
  /** true once the pet has sat past the terminal rung for `removalGraceHours` — long
   * enough to be REMOVED from the menagerie (despawned). Holds in both modes, so even a
   * normal-mode pet stuck "fainted" eventually clears. Derived, like every other rung. */
  gone: boolean;
  /** Resources after draining to `now`. */
  resources: Resources;
  /** Hours elapsed since lastUpdated (clamped at 0 for clock skew). */
  elapsedHours: number;
}

/**
 * Pure. Drains `energy` linearly from its snapshot value to `now`, then reads the
 * ladder rung off the result. Never mutates the input.
 */
export function decay(snapshot: DecayInput, now: number): Liveness {
  const rate = DECAY.energyLostPerHour;
  const elapsedMs = Math.max(0, now - snapshot.lastUpdated);
  const elapsedHours = elapsedMs / TIME.HOUR_MS;

  const startEnergy = clamp01(snapshot.resources.energy);
  const currentEnergy = clamp01(startEnergy - rate * elapsedHours);

  // Hours (from lastUpdated) at which energy first hits zero, then how long it has
  // sat empty. rate === 0 disables decay → never empties.
  const hoursToZero = rate > 0 ? startEnergy / rate : Number.POSITIVE_INFINITY;
  const hoursPastZero = Math.max(0, elapsedHours - hoursToZero);

  // Working only while the flag is set AND the signal is still fresh — the window is
  // applied here so it always reflects current config and never goes stale.
  const activity: ActivityStatus =
    snapshot.working && elapsedMs < ACTIVITY.workTimeoutMs ? "active" : "idle";
  const resources: Resources = { ...snapshot.resources, energy: currentEnergy };
  // Removed once it has been terminal for the removal grace. Zero for any live/recoverable
  // rung (hoursPastZero is 0 until energy empties), so only ever true deep in the terminal.
  const gone = hoursPastZero >= DECAY.terminalGraceHours + DECAY.removalGraceHours;
  const base = { resources, elapsedHours, activity, gone };

  if (currentEnergy >= DECAY.thresholds.lively) {
    return { ...base, status: "lively", alive: true };
  }
  if (currentEnergy >= DECAY.thresholds.weary) {
    return { ...base, status: "weary", alive: true };
  }
  if (currentEnergy > 0) {
    return { ...base, status: "drained", alive: true };
  }

  // Idle → fainted → dead. Empty but still within the grace → a brief faint.
  if (hoursPastZero < DECAY.terminalGraceHours) {
    return { ...base, status: "fainted", alive: true };
  }

  // Past the grace → DEAD (the slump). Death is NEVER permanent: a session can always be
  // revived by using it again (apply() refills energy regardless of status), so `alive`
  // stays true the whole time — until the pet crosses `gone` and is removed from view.
  return { ...base, status: "dead", alive: true };
}

/** Convenience predicate used by the leaderboard (dead pets drop / grey out). */
export function isAlive(snapshot: DecayInput, now: number): boolean {
  return decay(snapshot, now).alive;
}
