/**
 * Deterministic pet identity from a Claude Code session id.
 *
 * The SERVER decides a session-pet's species + name (never the client), so a pet looks
 * the same no matter which surface first registers the session, and an `activity` event
 * that arrives before its `register` can auto-spawn an identical pet. Pure.
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
    species: SPECIES[h % SPECIES.length],
    name: NAMES[(h >>> 8) % NAMES.length],
  };
}
