/**
 * The event type and the `apply` reducer — the heart of the credible-state design.
 *
 * One pet = one Claude Code session. Clients NEVER write totals; they emit timestamped
 * events and this reducer (run by the Convex authority, and locally by clients for an
 * instant preview) decays to the event time and folds the event in. Running the SAME
 * reducer everywhere is what keeps N machines on one account consistent.
 *
 * Two event kinds:
 *  - `register` — spawns / wakes a session-pet (full energy). Idempotent at the
 *    authority by (account, sessionId).
 *  - `activity` — the session was used. Replenishes energy, stamps `lastUpdated` (which
 *    is what makes the pet read as "active"), and accumulates usage stats.
 *
 * There is NO manual feed/pet — energy comes only from real Claude usage.
 *
 * Ordering contract (see README guardrails):
 *  - Additive stats (tokens, lines, promptQualitySum/Count) sum order-free — replaying
 *    events in any order yields the same totals.
 *  - Order-sensitive stats (survivalStreakDays, zoneAchievements) are NOT derived here;
 *    the server computes them from its authoritative sequence. They are carried through
 *    untouched. (STUB — see TODO.)
 */

import { ACTIVITY } from "./config.js";
import { decay, type PetAction, type WaitingKind } from "./decay.js";
import { type Entity, replenish } from "./entities.js";
import type { Appraisal } from "./prompt.js";
import { newResources } from "./resources.js";
import type { TrainerStats } from "./scoring.js";

export type EventType = "register" | "activity";

interface EventBase {
  type: EventType;
  /** The session this event belongs to. Used by the authority to route to the right pet. */
  sessionId: string;
  /**
   * epoch ms. Server-stamped and authoritative once ingested; client-supplied
   * timestamps on inbound events are advisory only.
   */
  at: number;
  /** Idempotency key — unique per logical event; the server dedups on it. */
  clientEventId: string;
}

export interface RegisterEvent extends EventBase {
  type: "register";
}

export interface ActivityEvent extends EventBase {
  type: "activity";
  /**
   * Is the session working as of this event? true on a turn start (UserPromptSubmit),
   * false on a turn end (Stop). Drives `workingUntil` → the mining animation.
   */
  working?: boolean;
  /**
   * Attention signal as of this event. Set on a Notification — "alert" for a permission
   * prompt, "question" for an idle wait-for-input. Absent/"none" clears it. Drives the ?/!
   * bubble (decay applies the freshness window). No text — only the enum leaves the sensor.
   */
  waiting?: WaitingKind;
  /**
   * The live tool category as of this event (set on PreToolUse/PostToolUse). Absent/"none"
   * ⇒ no specific job. A tool CATEGORY only — never tool input. Drives the pet's room/anim.
   */
  action?: PetAction;
  /** Did this turn end in FAILURE (StopFailure)? Sets the "knocked out" state; absent/false
   * clears it. */
  failed?: boolean;
  /**
   * The SESSION itself ended — a clean exit (SessionEnd) or a detected kill (the sensor saw
   * the agent process disappear). The pet collapses to EMPTY energy so it faints now and
   * crosses dead→gone on the terminal grace windows (~1 min → ~4 min), instead of slow-decaying
   * for ~10 min first. Recoverable like any death: a later register/activity refills it.
   */
  ended?: boolean;
  /**
   * Numeric appraisal from the sensor when a turn completes. No prompt text — privacy
   * is structural. Absent on a lightweight turn-start ping.
   */
  appraisal?: Appraisal;
  /** Token count read from the Claude Code transcript at the Stop event. */
  tokens?: number;
  /** Lines authored attributable to this turn. */
  linesAuthored?: number;
}

export type Event = RegisterEvent | ActivityEvent;

/**
 * Raw, summable per-pet stats. `avgPromptQuality` is DERIVED (sum/count) rather than
 * stored, so it stays order-free. Convert to TrainerStats with `toTrainerStats`.
 */
export interface AccountStats {
  tokensFed: number;
  linesAuthored: number;
  promptQualitySum: number;
  promptCount: number;
  /** Server-derived from authoritative sequence (carried through here). */
  survivalStreakDays: number;
  /** Server-derived (carried through here). */
  zoneAchievements: number;
}

export interface ReducedState {
  entity: Entity;
  stats: AccountStats;
}

export function newStats(): AccountStats {
  return {
    tokensFed: 0,
    linesAuthored: 0,
    promptQualitySum: 0,
    promptCount: 0,
    survivalStreakDays: 0,
    zoneAchievements: 0,
  };
}

export function avgPromptQuality(stats: AccountStats): number {
  return stats.promptCount > 0 ? stats.promptQualitySum / stats.promptCount : 0;
}

export function toTrainerStats(stats: AccountStats): TrainerStats {
  return {
    tokensFed: stats.tokensFed,
    linesAuthored: stats.linesAuthored,
    avgPromptQuality: avgPromptQuality(stats),
    survivalStreakDays: stats.survivalStreakDays,
    zoneAchievements: stats.zoneAchievements,
  };
}

/**
 * Pure reducer. Decays the entity to `event.at`, folds in the event, then stamps
 * `lastUpdated = event.at`. Used identically on server and clients.
 */
export function apply(state: ReducedState, event: Event): ReducedState {
  // 1. Decay to the moment of the event (lazy decay — no tick).
  const live = decay(state.entity, event.at);
  const decayed: Entity = { ...state.entity, resources: live.resources };

  switch (event.type) {
    case "register": {
      // Spawn / wake: a fresh session-pet is fully energized, not working. Stats untouched.
      return {
        entity: { ...decayed, resources: newResources(), working: false, waiting: "none", action: "none", failed: false, lastUpdated: event.at },
        stats: state.stats,
      };
    }
    case "activity": {
      // Session over (clean exit OR detected kill) → collapse to empty so the pet faints now
      // and the terminal grace windows take it to dead→gone fast. No replenish, stats untouched.
      if (event.ended) {
        return {
          entity: { ...decayed, resources: { ...decayed.resources, energy: 0 }, working: false, waiting: "none", action: "none", failed: false, lastUpdated: event.at },
          stats: state.stats,
        };
      }
      // Substantive turns add quality-driven energy; a ping adds a small fixed bump.
      const gain = event.appraisal ? event.appraisal.fill : ACTIVITY.pingEnergy;
      const next = replenish(decayed, gain);
      return {
        // working + waiting + action flags + this event's time; decay() applies the freshness windows.
        entity: { ...next, working: event.working ?? false, waiting: event.waiting ?? "none", action: event.action ?? "none", failed: event.failed ?? false, lastUpdated: event.at },
        stats: {
          ...state.stats,
          tokensFed: state.stats.tokensFed + (event.tokens ?? 0),
          linesAuthored: state.stats.linesAuthored + (event.linesAuthored ?? 0),
          // Only real appraisals count toward the prompt-quality average.
          promptQualitySum:
            state.stats.promptQualitySum + (event.appraisal?.quality ?? 0),
          promptCount: state.stats.promptCount + (event.appraisal ? 1 : 0),
        },
      };
    }
  }
}
