/**
 * TrainerScore — the competitive, leaderboard-facing number.
 *
 * Weights live in config.ts. The only subtlety is `avgPromptQuality`: it is
 * client-computed and server-unverifiable, so by default it is EXCLUDED from the
 * competitive score (weight 0 + `includePromptQualityInScore: false`). See config.ts
 * and README open-decision #1.
 */

import { SCORING, type ScoringWeights } from "./config.js";

export interface TrainerStats {
  tokensFed: number;
  linesAuthored: number;
  /** 0..1. Server-unverifiable — see note above. */
  avgPromptQuality: number;
  survivalStreakDays: number;
  zoneAchievements: number;
}

export interface ScoreOptions {
  weights?: ScoringWeights;
  /** Defaults to the config flag. When false, the avgPromptQuality term is dropped entirely. */
  includePromptQuality?: boolean;
}

export function score(stats: TrainerStats, options: ScoreOptions = {}): number {
  const weights = options.weights ?? SCORING.weights;
  const includeQuality = options.includePromptQuality ?? SCORING.includePromptQualityInScore;

  let total = 0;
  total += stats.tokensFed * weights.tokensFed;
  total += stats.linesAuthored * weights.linesAuthored;
  total += stats.survivalStreakDays * weights.survivalStreakDays;
  total += stats.zoneAchievements * weights.zoneAchievements;
  if (includeQuality) {
    total += stats.avgPromptQuality * weights.avgPromptQuality;
  }

  return Math.round(total);
}
