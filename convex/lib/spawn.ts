/**
 * Pet identity assigned by the SERVER (never the client) when a session-pet is first
 * spawned. The pet row is created once and then persisted, so this only runs at spawn:
 *  - species is RANDOM (knight / wizard / rogue) so the menagerie is varied.
 *  - name stays deterministic from the session id (a stable, friendly label).
 */

import type { Species } from "@agent-idle/engine";

const SPECIES: readonly Species[] = ["knight", "wizard", "rogue"];

// Small, friendly menagerie names. Extend freely.
const NAMES: readonly string[] = [
  "Pixel", "Ember", "Quill", "Sprocket", "Mochi", "Biscuit", "Pip", "Nova",
  "Tycho", "Wren", "Pebble", "Juniper", "Cinder", "Mip", "Bramble", "Fig",
];

/** FNV-1a — tiny, deterministic, no deps. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function spawnFields(sessionId: string): { species: Species; name: string } {
  const h = hash(sessionId);
  return {
    species: SPECIES[Math.floor(Math.random() * SPECIES.length)],
    name: NAMES[(h >>> 8) % NAMES.length],
  };
}
