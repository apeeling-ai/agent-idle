/**
 * Entities and the pure `replenish` mutation. No timers, no IO.
 *
 * One entity = one Claude Code session ("pet"). Species map onto the Pixel Crawler NPC
 * sprite sets the app loads (Knight, Wizard, Rogue). The engine only names the species;
 * the compositor maps it to a sprite.
 */

import type { Mode } from "./config.js";
import { clamp01, newResources, type Resources } from "./resources.js";

export type Species = "knight" | "wizard" | "rogue";

export interface Cosmetics {
  owned: string[];
  equipped: string[];
}

export interface Entity {
  id: string;
  /** The Claude Code session this pet represents. */
  sessionId: string;
  species: Species;
  name: string;
  resources: Resources;
  cosmetics: Cosmetics;
  mode: Mode;
  /** epoch ms of the last usage (register/activity). Liveness is DERIVED from this via decay(). */
  lastUpdated: number;
  /**
   * Was the session working as of its last event (true on a turn start/renewal, false on
   * Stop)? It only counts as "mining" while ALSO fresh — see decay(): the window is
   * applied at read time from config, so a closed session lapses to idle on its own.
   */
  working: boolean;
}

export interface NewEntityParams {
  id: string;
  sessionId: string;
  name: string;
  species: Species;
  /** Defaults to "normal" (faint-and-recover). Hardcore = permanent death. */
  mode?: Mode;
  /** epoch ms; the engine cannot read the clock, so the caller supplies it. */
  now: number;
}

/** Spawn a fresh, fully-energized pet for a session. */
export function newEntity(params: NewEntityParams): Entity {
  return {
    id: params.id,
    sessionId: params.sessionId,
    name: params.name,
    species: params.species,
    resources: newResources(),
    cosmetics: { owned: [], equipped: [] },
    mode: params.mode ?? "normal",
    lastUpdated: params.now,
    working: false, // not working until a turn starts
  };
}

/**
 * Add `amount` (0..1) of energy to the entity. PURE: returns a new entity and does NOT
 * advance `lastUpdated` — the event reducer (events.ts) is responsible for decaying to
 * the event time and stamping `lastUpdated`. Keeping this split is what lets the server
 * and clients agree on the math.
 */
export function replenish(entity: Entity, amount: number): Entity {
  return {
    ...entity,
    resources: {
      ...entity.resources,
      energy: clamp01(entity.resources.energy + amount),
    },
  };
}
