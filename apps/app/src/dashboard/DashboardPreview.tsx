/**
 * DEV-ONLY dashboard preview. Open with `?dash` in the Vite dev server (see main.tsx) —
 * needs no Convex/auth. Feeds the real Dashboard tree synthetic-but-plausible data so the
 * stats UI can be designed, screenshotted, and reviewed without a live backend, exactly
 * like `?gallery` / `?harness` do for the render seam.
 */

import { Dashboard } from "./Dashboard";
import type { ActionMs, DayPoint, LeaderboardData, LifetimeTotals, StatsOverview } from "./types";

const DAY = 20614; // Jun 10, 2026 (UTC day index)

/** A weekday-heavy, lightly-random day of work. Deterministic per day (no clock/Math.random). */
function day(utcDay: number): DayPoint {
  const dow = ((utcDay % 7) + 7) % 7; // 0..6
  const weekend = dow === 5 || dow === 6;
  const wob = ((utcDay * 2654435761) >>> 0) / 0xffffffff; // stable 0..1 hash
  const intensity = weekend ? 0.15 + wob * 0.3 : 0.55 + wob * 0.45;
  const activeMs = Math.round(intensity * 3.2 * 60 * 60 * 1000);
  const shell = Math.round(activeMs * 0.34);
  const edit = Math.round(activeMs * 0.41);
  const read = Math.round(activeMs * 0.16);
  const web = Math.round(activeMs * 0.05);
  const thinking = Math.round(activeMs * 0.04);
  const actionMs: ActionMs = { shell, edit, read, web, thinking, idle: Math.round(activeMs * 0.5) };
  const tokensFed = Math.round(intensity * 1_900_000);
  return { utcDay, tokensFed, activeMs, actionMs, score: Math.round(tokensFed / 1000) };
}

const days: DayPoint[] = Array.from({ length: 340 }, (_, i) => day(DAY - 339 + i));
const today = days[days.length - 1];

function sum(ds: DayPoint[]): { tokensFed: number; activeMs: number; actionMs: ActionMs; promptCount: number } {
  const a: ActionMs = { shell: 0, edit: 0, read: 0, web: 0, thinking: 0, idle: 0 };
  let tokensFed = 0,
    activeMs = 0;
  for (const d of ds) {
    tokensFed += d.tokensFed;
    activeMs += d.activeMs;
    (Object.keys(a) as (keyof ActionMs)[]).forEach((k) => (a[k] += d.actionMs[k]));
  }
  // ~one worked turn per ~90s of active time, as a plausible promptCount.
  return { tokensFed, activeMs, actionMs: a, promptCount: Math.round(activeMs / 90_000) };
}

const seasonDays = days.filter((d) => new Date(d.utcDay * 86400000).getUTCMonth() === 5); // June
const s = sum(seasonDays);
const all = sum(days);

const overview: StatsOverview = {
  today: { tokensFed: today.tokensFed, activeMs: today.activeMs, actionMs: today.actionMs, promptQualitySum: 0, promptCount: Math.round(today.activeMs / 90_000) },
  season: { tokensFed: s.tokensFed, activeMs: s.activeMs, actionMs: s.actionMs, promptQualitySum: 0, promptCount: s.promptCount },
  lifetime: { tokensFed: all.tokensFed, activeMs: all.activeMs, actionMs: all.actionMs, promptQualitySum: 0, promptCount: all.promptCount },
  todayScore: today.score,
  seasonScore: Math.round(s.tokensFed / 1000),
  lifetimeScore: Math.round(all.tokensFed / 1000),
  streak: 14,
  longestStreak: 23,
  bestDay: days.reduce((b, d) => (d.score > b.score ? d : b)),
  daysActive: days.filter((d) => d.activeMs > 0).length,
  days,
  utcDay: DAY,
};

const lifetime: LifetimeTotals = { tokensFed: all.tokensFed, activeMs: all.activeMs, promptCount: all.promptCount };

const YOU_TOKENS = 67_400_000;
const leaderboard: LeaderboardData = {
  entries: [
    { name: "context_lord", tokens: 142_000_000, isYou: false },
    { name: "promptsmith", tokens: 98_400_000, isYou: false },
    { name: "you", tokens: YOU_TOKENS, isYou: true },
    { name: "midnight_committer", tokens: 41_200_000, isYou: false },
    { name: "rubber_duck_dev", tokens: 28_900_000, isYou: false },
  ].sort((a, b) => b.tokens - a.tokens),
  you: { tokens: YOU_TOKENS, rank: 3 },
  utcDay: DAY,
};

export function DashboardPreview() {
  const tab = new URLSearchParams(window.location.search).get("dash");
  const initialTab = tab === "history" || tab === "leaderboard" ? tab : "overview";
  return <Dashboard overview={overview} lifetime={lifetime} leaderboard={leaderboard} onClose={() => {}} initialTab={initialTab} />;
}
