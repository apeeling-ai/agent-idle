/**
 * LAZY decay. The whole liveness model is a pure function of elapsed time since
 * `lastUpdated` (the last usage) — there is NO scheduled tick anywhere in the system.
 * Both the server (at event-reduce and at read) and the clients call `decay()` to
 * derive the current status identically.
 *
 * Two dimensions come out of one snapshot:
 *  - `activity` ("active" | "idle") — the working signal: is `now` before the session's
 *    `workingUntil`? Set ahead on a turn start, cleared on Stop, so the pet mines exactly
 *    while Claude works. Drives the mining vs resting animation.
 *  - `status` — the SLOW survival ladder read off the decayed `energy`. Auto-faint /
 *    auto-death is just the terminal rung being crossed by elapsed time; because it is
 *    derived, a pet nobody has used for a week is already "dead" the instant someone
 *    reads it — no job had to run.
 */

import { DECAY, MODE, TIME, type Mode } from "./config.js";
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
  /** epoch ms until which the session is "working" (mining). `now < workingUntil` ⇒ active. */
  workingUntil: number;
  mode: Mode;
}

export interface Liveness {
  status: LivenessStatus;
  /** Short-term usage signal — "active" when used within ACTIVITY.activeWindowMs. */
  activity: ActivityStatus;
  /** false only when a hardcore pet has crossed the terminal rung. */
  alive: boolean;
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

  const activity: ActivityStatus = now < snapshot.workingUntil ? "active" : "idle";
  const resources: Resources = { ...snapshot.resources, energy: currentEnergy };
  const base = { resources, elapsedHours, activity };

  if (currentEnergy >= DECAY.thresholds.lively) {
    return { ...base, status: "lively", alive: true };
  }
  if (currentEnergy >= DECAY.thresholds.weary) {
    return { ...base, status: "weary", alive: true };
  }
  if (currentEnergy > 0) {
    return { ...base, status: "drained", alive: true };
  }

  // Empty. Fainted (recoverable) until the terminal grace elapses.
  if (hoursPastZero < DECAY.terminalGraceHours) {
    return { ...base, status: "fainted", alive: true };
  }

  // Terminal rung. Mode decides whether this is permanent death or a deep faint.
  if (MODE[snapshot.mode].terminalIsDeath) {
    return { ...base, status: "dead", alive: false };
  }
  return { ...base, status: "fainted", alive: true };
}

/** Convenience predicate used by the leaderboard (dead pets drop / grey out). */
export function isAlive(snapshot: DecayInput, now: number): boolean {
  return decay(snapshot, now).alive;
}
