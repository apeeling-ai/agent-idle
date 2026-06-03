/**
 * Entities and the pure `feed` mutation. No timers, no IO.
 *
 * Species map onto the Pixel Crawler NPC sprite sets the app loads (Knight, Wizard,
 * Rogue). The engine only names the species; the compositor maps it to a sprite.
 */

import type { Mode } from "./config.js";
import type { Appraisal } from "./prompt.js";
import { clamp01, newResources, type Resources } from "./resources.js";

export type Species = "knight" | "wizard" | "rogue";

export interface Cosmetics {
  owned: string[];
  equipped: string[];
}

export interface Entity {
  id: string;
  species: Species;
  name: string;
  resources: Resources;
  cosmetics: Cosmetics;
  mode: Mode;
  /** epoch ms of the last reduce. Liveness is DERIVED from this via decay(). */
  lastUpdated: number;
}

export interface NewEntityParams {
  id: string;
  name: string;
  species: Species;
  /** Defaults to "normal" (faint-and-recover). Hardcore = permanent death. */
  mode?: Mode;
  /** epoch ms; the engine cannot read the clock, so the caller supplies it. */
  now: number;
}

export function newEntity(params: NewEntityParams): Entity {
  return {
    id: params.id,
    name: params.name,
    species: params.species,
    resources: newResources(),
    cosmetics: { owned: [], equipped: [] },
    mode: params.mode ?? "normal",
    lastUpdated: params.now,
  };
}

/**
 * Apply a feeding's `fill` to the entity. PURE: returns a new entity and does NOT
 * advance `lastUpdated` — the event reducer (events.ts) is responsible for decaying
 * to the event time and stamping `lastUpdated`. Keeping this split is what lets the
 * server and clients agree on the math.
 */
export function feed(entity: Entity, appraisal: Appraisal): Entity {
  return {
    ...entity,
    resources: {
      ...entity.resources,
      fullness: clamp01(entity.resources.fullness + appraisal.fill),
    },
  };
}
