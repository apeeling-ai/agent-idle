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

/**
 * Does the session want the human's attention right now? Drives the ?/! status bubble.
 *  - "alert"    → blocked on a permission/approval prompt (an exclamation: needs you to act).
 *  - "question" → idle, waiting for input (a gentle question: your turn).
 *  - "none"     → not waiting on anyone.
 * Like `working`, it's a flag the sensor sets; freshness (ACTIVITY.waitTimeoutMs) is applied
 * HERE at read time, so a forgotten prompt eventually clears on its own.
 */
export type WaitingKind = "none" | "alert" | "question";

/**
 * What the session is doing right now, classified from the live tool (PreToolUse/PostToolUse)
 * by the sensor — a tool CATEGORY only, never tool input. Drives which "job" (and which room)
 * the pet shows while active. "none" ⇒ no specific tool (turn start / between tools) ⇒ the
 * renderer falls back to the pet's default seed action. Only the enum leaves the machine.
 *  - "shell" → running commands (Bash)         → mining
 *  - "edit"  → writing code (Edit/Write)        → chopping (lumber)
 *  - "read"  → reading/searching (Read/Grep)    → fishing (pond)
 *  - "web"   → web fetch/search                 → fishing (pond)
 */
export type PetAction = "none" | "shell" | "edit" | "read" | "web";

/** Minimal snapshot needed to derive liveness. Both an Entity and a cached DB row satisfy this. */
export interface DecayInput {
  resources: Resources;
  /** epoch ms of the last usage (register/activity). */
  lastUpdated: number;
  /** Was the last event a "working" one? Combined with freshness ⇒ active. */
  working: boolean;
  /** The latest attention signal. Combined with freshness ⇒ the ?/! bubble. */
  waiting: WaitingKind;
  /** The live tool category. Combined with freshness ⇒ the pet's current job/room. */
  action: PetAction;
  /** Did the last turn END IN FAILURE (StopFailure)? Combined with freshness ⇒ the pet shows
   * "knocked out" (collapsed at camp) until it recovers or the next turn starts. */
  failed: boolean;
  mode: Mode;
}

export interface Liveness {
  status: LivenessStatus;
  /** Short-term usage signal — "active" when used within ACTIVITY.activeWindowMs. */
  activity: ActivityStatus;
  /** Attention signal — the ?/! bubble, "none" once the wait signal goes stale. */
  waiting: WaitingKind;
  /** The current job, "none" when idle/stale (drives which room the pet works in). */
  action: PetAction;
  /** True briefly after a failed turn (StopFailure) → the pet is collapsed at camp. */
  failed: boolean;
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
  // The attention bubble only shows while the wait signal is still fresh; like `working`,
  // the window is applied here so a forgotten prompt lapses to "none" on its own.
  const waiting: WaitingKind =
    snapshot.waiting !== "none" && elapsedMs < ACTIVITY.waitTimeoutMs ? snapshot.waiting : "none";
  // The job only applies while the pet is active (same window as `activity`); otherwise it
  // rests, so a stale tool category never pins it to a work room.
  const action: PetAction = activity === "active" ? snapshot.action : "none";
  // "Knocked out" after a failed turn, until it recovers (window) or the next turn clears it.
  const failed = snapshot.failed && elapsedMs < ACTIVITY.failTimeoutMs;
  const resources: Resources = { ...snapshot.resources, energy: currentEnergy };
  // Removed once it has been terminal for the removal grace. Zero for any live/recoverable
  // rung (hoursPastZero is 0 until energy empties), so only ever true deep in the terminal.
  const gone = hoursPastZero >= DECAY.terminalGraceHours + DECAY.removalGraceHours;
  const base = { resources, elapsedHours, activity, waiting, action, failed, gone };

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

/**
 * The LONGEST possible time (ms) from a pet's `lastUpdated` until it crosses `gone`,
 * assuming it was at FULL energy at that moment (the worst case — `startEnergy` ≤ 1, so
 * `hoursToZero` ≤ 1/rate). Any pet whose `lastUpdated` is older than this is DEFINITELY
 * despawned no matter its stored energy, so a read can bound its scan to
 * `lastUpdated > now - maxLifespanMs()` instead of loading every pet an account ever had.
 * Returns Infinity when decay is disabled (rate ≤ 0) — callers then fall back to scanning all.
 */
export function maxLifespanMs(): number {
  const rate = DECAY.energyLostPerHour;
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  const hours = 1 / rate + DECAY.terminalGraceHours + DECAY.removalGraceHours;
  return hours * TIME.HOUR_MS;
}
