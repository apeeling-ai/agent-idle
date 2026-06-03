/**
 * The event type and the `apply` reducer — the heart of the credible-state design.
 *
 * Clients NEVER write totals. They emit signed, timestamped events; this reducer
 * (run by the Convex authority, and locally by clients for instant preview) decays
 * to the event time and folds the event in. Running the SAME reducer everywhere is
 * what keeps N machines on one account consistent.
 *
 * Ordering contract (see README guardrails):
 *  - Additive stats (tokensFed, linesAuthored, promptQualitySum/Count) sum
 *    order-free — replaying events in any order yields the same totals.
 *  - Order-sensitive stats (survivalStreakDays, zoneAchievements) are NOT derived
 *    here; the server computes them from its authoritative sequence. They are
 *    carried through untouched. (STUB — see TODO.)
 */

import { INTERACTION } from "./config.js";
import { decay } from "./decay.js";
import { type Entity, feed } from "./entities.js";
import type { Appraisal } from "./prompt.js";
import { clamp01 } from "./resources.js";
import type { TrainerStats } from "./scoring.js";

export type EventType = "feed" | "pet";

interface EventBase {
  type: EventType;
  /**
   * epoch ms. Server-stamped and authoritative once ingested; client-supplied
   * timestamps on inbound events are advisory only.
   */
  at: number;
  /** Idempotency key — unique per logical event; the server dedups on it. */
  clientEventId: string;
}

export interface FeedEvent extends EventBase {
  type: "feed";
  /** Numeric appraisal from the sensor. No prompt text — privacy is structural. */
  appraisal: Appraisal;
  /** Token count read from the Claude Code transcript at the Stop event. */
  tokens?: number;
  /** Lines authored attributable to this turn. */
  linesAuthored?: number;
}

export interface PetEvent extends EventBase {
  type: "pet";
}

export type Event = FeedEvent | PetEvent;

/**
 * Raw, summable account stats. `avgPromptQuality` is DERIVED (sum/count) rather than
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
    case "feed": {
      const fedEntity = feed(decayed, event.appraisal);
      return {
        entity: { ...fedEntity, lastUpdated: event.at },
        stats: {
          ...state.stats,
          tokensFed: state.stats.tokensFed + (event.tokens ?? 0),
          linesAuthored: state.stats.linesAuthored + (event.linesAuthored ?? 0),
          promptQualitySum: state.stats.promptQualitySum + event.appraisal.quality,
          promptCount: state.stats.promptCount + 1,
        },
      };
    }
    case "pet": {
      return {
        entity: {
          ...decayed,
          resources: {
            ...decayed.resources,
            fullness: clamp01(decayed.resources.fullness + INTERACTION.petFullnessBump),
          },
          lastUpdated: event.at,
        },
        stats: state.stats,
      };
    }
  }
}
