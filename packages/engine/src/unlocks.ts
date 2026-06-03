/**
 * Cosmetic unlocks. Pure stat-threshold rules → owned cosmetic ids.
 *
 * Cosmetics are render layers (see the app compositor: base → body → head → aura →
 * status). The engine only decides WHICH ids are owned; it never touches pixels.
 */

import type { TrainerStats } from "./scoring.js";

export interface UnlockRule {
  /** Cosmetic id — becomes a compositor layer when equipped. */
  cosmetic: string;
  /** Human-facing label for UI. */
  label: string;
  /** All listed stat minimums must be met. */
  requires: Partial<TrainerStats>;
}

/** Starter set. Extend freely — rules are declarative and pure. */
export const UNLOCK_RULES: readonly UnlockRule[] = [
  { cosmetic: "helm.bronze", label: "Bronze Helm", requires: { tokensFed: 50_000 } },
  { cosmetic: "helm.iron", label: "Iron Helm", requires: { tokensFed: 250_000 } },
  { cosmetic: "aura.streak", label: "Streak Aura", requires: { survivalStreakDays: 7 } },
  { cosmetic: "cape.explorer", label: "Explorer Cape", requires: { zoneAchievements: 3 } },
  { cosmetic: "armor.scribe", label: "Scribe's Plate", requires: { linesAuthored: 10_000 } },
];

function meetsRequirement(stats: TrainerStats, requires: Partial<TrainerStats>): boolean {
  return (Object.keys(requires) as (keyof TrainerStats)[]).every(
    (key) => stats[key] >= (requires[key] ?? 0),
  );
}

/** Returns the cosmetic ids unlocked at these stats. Pure, order-free. */
export function evaluateUnlocks(
  stats: TrainerStats,
  rules: readonly UnlockRule[] = UNLOCK_RULES,
): string[] {
  return rules.filter((rule) => meetsRequirement(stats, rule.requires)).map((rule) => rule.cosmetic);
}
