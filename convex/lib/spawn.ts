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

/**
 * Pick a name that isn't already taken in this account's menagerie. The session-id hash
 * chooses the *preferred* name (stable for a given session), but if it's taken we scan the
 * pool from there for the first free name. Once all NAMES are in use we append the smallest
 * numeric suffix that frees up the preferred name (e.g. "Pixel 2").
 */
function pickName(sessionId: string, taken: ReadonlySet<string>): string {
  const h = hash(sessionId);
  const start = (h >>> 8) % NAMES.length;
  for (let i = 0; i < NAMES.length; i++) {
    const candidate = NAMES[(start + i) % NAMES.length];
    if (!taken.has(candidate)) return candidate;
  }
  // Pool exhausted — suffix the preferred name until it's unique.
  const base = NAMES[start];
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function spawnFields(
  sessionId: string,
  takenNames: ReadonlySet<string> = new Set(),
): { species: Species; name: string } {
  return {
    species: SPECIES[Math.floor(Math.random() * SPECIES.length)],
    name: pickName(sessionId, takenNames),
  };
}
