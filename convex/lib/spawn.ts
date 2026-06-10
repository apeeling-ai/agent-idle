/**
 * Pet identity assigned by the SERVER (never the client) when a session-pet is first
 * spawned. The pet row is created once and then persisted, so this only runs at spawn:
 *  - species is RANDOM (knight / wizard / rogue) so the menagerie is varied.
 *  - name stays deterministic from the session id (a stable, friendly label).
 */

import type { Species } from "@agent-idle/engine";

const SPECIES: readonly Species[] = ["knight", "wizard", "rogue"];

// Small, friendly menagerie names (single words — the nicest tier). Extend freely.
const NOUNS: readonly string[] = [
  "Pixel", "Ember", "Quill", "Sprocket", "Mochi", "Biscuit", "Pip", "Nova",
  "Tycho", "Wren", "Pebble", "Juniper", "Cinder", "Mip", "Bramble", "Fig",
  "Acorn", "Maple", "Clover", "Pippin", "Waffle", "Tofu", "Olive", "Hazel",
  "Comet", "Pesto", "Noodle", "Dewdrop", "Marble", "Sage",
];

// Friendly adjectives — combined with a noun ("Plucky Pebble") once the single names run out,
// so a big menagerie still gets nice, readable names instead of "Pebble 2".
const ADJECTIVES: readonly string[] = [
  "Brave", "Tiny", "Sunny", "Clever", "Fuzzy", "Lucky", "Merry", "Swift",
  "Cozy", "Bold", "Plucky", "Jolly", "Spry", "Dapper", "Wee", "Zippy",
  "Gentle", "Snug", "Chipper", "Nimble", "Cheeky", "Quirky", "Mellow", "Bouncy",
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
 * Pick a name not already taken in this account's menagerie, staying NICE as the menagerie grows:
 *  1. a single friendly noun ("Pebble") — the session-id hash picks the preferred one, scanning
 *     the pool from there for the first free name (stable for a given session);
 *  2. once every single noun is taken, an adjective + noun ("Plucky Pebble") — ~700 combinations,
 *     so realistic accounts never run out of pleasant names;
 *  3. only if even that space is exhausted (>700 pets) do we fall back to a numeric suffix.
 * Always returns a name unique within `taken`.
 */
export function pickName(sessionId: string, taken: ReadonlySet<string>): string {
  const h = hash(sessionId);
  const nStart = (h >>> 8) % NOUNS.length;

  // Tier 1: a single noun.
  for (let i = 0; i < NOUNS.length; i++) {
    const candidate = NOUNS[(nStart + i) % NOUNS.length];
    if (!taken.has(candidate)) return candidate;
  }

  // Tier 2: adjective + noun (still nice; hundreds of combinations).
  const aStart = (h >>> 16) % ADJECTIVES.length;
  for (let a = 0; a < ADJECTIVES.length; a++) {
    const adj = ADJECTIVES[(aStart + a) % ADJECTIVES.length];
    for (let i = 0; i < NOUNS.length; i++) {
      const candidate = `${adj} ${NOUNS[(nStart + i) % NOUNS.length]}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  // Tier 3 (extreme last resort): numeric suffix.
  const base = NOUNS[nStart];
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
