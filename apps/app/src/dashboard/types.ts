/**
 * Prop shapes for the dashboard, mirroring what the convex/stats.ts queries return.
 * Kept local (not imported from the generated API) so the dashboard stays a window- and
 * backend-agnostic component tree — the same render/-is-extractable philosophy.
 */

export interface ActionMs {
  shell: number;
  edit: number;
  read: number;
  web: number;
  thinking: number;
  idle: number;
}

export interface Rollup {
  tokensFed: number;
  activeMs: number;
  actionMs: ActionMs;
  promptQualitySum: number;
  promptCount: number;
}

/** One day's headline numbers — the series the heatmap, trend bars, and records derive from. */
export interface DayPoint {
  utcDay: number;
  tokensFed: number;
  activeMs: number;
  actionMs: ActionMs;
  score: number;
}

/**
 * Canonical never-reset accumulation, summed from per-pet `entities.stats` by getPlayerState.
 * This is the TRUE lifetime total (tokens/lines/turns ever) — unlike the dailyStats rollup,
 * which only covers the days it has rows for. The Overview's "Lifetime" figures use this so
 * they never appear to reset or under-report.
 */
export interface LifetimeTotals {
  tokensFed: number;
  activeMs: number;
  promptCount: number;
}

export interface StatsOverview {
  today: Rollup | null;
  season: Rollup;
  lifetime: Rollup;
  todayScore: number;
  seasonScore: number;
  lifetimeScore: number;
  /** The caller's live standing on each board (exact, global), for the always-visible chip. */
  dailyRank: { rank: number; total: number } | null;
  seasonRank: { rank: number; total: number } | null;
  streak: number;
  longestStreak: number;
  bestDay: { utcDay: number; score: number } | null;
  daysActive: number;
  days: DayPoint[];
  utcDay: number;
  /** The current 2-week season index (engine.seasonIndexOf). */
  season_index: number;
}

/** One of the account's pets (Claude Code sessions), for the all-time hall of fame. */
export interface PetStat {
  name: string;
  species: string;
  tokensFed: number;
  promptCount: number;
  promptQualitySum: number;
  actionMs: ActionMs;
  status: string;
  alive: boolean;
  activity: string;
  bornAt: number;
  lastUpdated: number;
}

export interface LeaderboardEntry {
  name: string;
  tokens: number;
  isYou: boolean;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  /** The caller's own standing in this window: exact global rank among `total` active players. */
  you: { tokens: number; rank: number; total: number } | null;
  /** Present on the daily board (its UTC-day bucket). */
  utcDay?: number;
  /** Present on the season board (its 2-week season index). */
  season?: number;
  /** Season board only: epoch ms when the current season ends (the countdown target). */
  seasonEndsAt?: number;
  /** Season board only: the themed trophy a podium (top-3) finish wins this season. */
  reward?: { kind: string; glyph: string; label: string };
}
