/** Compact number/time formatters shared across the dashboard. */

/** 1234 → "1.2k", 2_500_000 → "2.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Whole-number score with thousands separators. */
export function formatScore(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Duration in ms → "3h 12m" / "12m" / "45s" / "0m". */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** Active-time goal that "closes the ring" each day. */
export const DAILY_ACTIVE_GOAL_MS = 2 * 60 * 60 * 1000;
