/**
 * Map a stored entity row to the engine's pure `Entity` shape. Keeping this in one
 * place means the authority and the leaderboard reduce identical inputs.
 */

import type { Cosmetics, Entity, Mode, Resources, Species } from "@agent-idle/engine";

export interface EntityRowLike {
  entityId: string;
  sessionId: string;
  species: Species;
  name: string;
  resources: Resources;
  cosmetics: Cosmetics;
  mode: Mode;
  lastUpdated: number;
  working?: boolean;
}

export function rowToEntity(row: EntityRowLike): Entity {
  return {
    id: row.entityId,
    sessionId: row.sessionId,
    species: row.species,
    name: row.name,
    resources: row.resources,
    cosmetics: row.cosmetics,
    mode: row.mode,
    lastUpdated: row.lastUpdated,
    working: row.working ?? false,
  };
}
