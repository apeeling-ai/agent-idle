/**
 * Daily-rollup math — the pure spine of the gamification dashboard (Today / Season /
 * All-Time scores, work-vs-idle time, effort breakdown). Like the rest of the engine
 * this is headless and deterministic: the Convex authority folds events into a per-day
 * rollup with these helpers, and the client re-uses the SAME aggregation/scoring so the
 * dashboard never disagrees with the server.
 *
 * Work-vs-idle is derived the same way liveness is — by INTEGRATING a flag over elapsed
 * time, never by storing windows. Each accepted activity event contributes the gap since
 * the session's previous event to `activeMs` *only if* the session was working then and
 * the gap is still fresh (< ACTIVITY.workTimeoutMs). The freshness cap means a span can
 * misattribute at most one window (~60s) across a UTC midnight boundary, so no
 * day-splitting is needed — the whole capped gap is booked to the event's day.
 */

import { ACTIVITY, SCORING, TIME } from "./config.js";
import type { PetAction } from "./decay.js";
import type { Appraisal } from "./prompt.js";

/**
 * The effort taxonomy for the time breakdown. The four tool categories map onto the diorama
 * rooms (see decay.ts PetAction), plus two states that used to be discarded:
 *  - `thinking` — working but in no specific tool (turn start / between tools / generating).
 *  - `idle`     — not working, or a stale gap where the session had gone quiet.
 * This is a SUPERSET of `PetAction` on purpose: the diorama taxonomy stays 4+none, while the
 * effort breakdown accounts for every capped gap so the bar sums to real elapsed time.
 */
export interface ActionMs {
  shell: number;
  edit: number;
  read: number;
  web: number;
  thinking: number;
  idle: number;
}

/** Which effort bucket a single gap is booked to. */
export type EffortBucket = keyof ActionMs;

/** One day's accumulated, order-free stats for an account. Additive: summing rollups
 * (see `sumDailies`) yields a valid larger-window rollup. */
export interface DailyRollup {
  tokensFed: number;
  /** Integrated working-time (ms) — the "work" half of work-vs-idle. */
  activeMs: number;
  /** activeMs split by what the session was doing. Sums to <= activeMs (idle gaps drop). */
  actionMs: ActionMs;
  promptQualitySum: number;
  promptCount: number;
}

/** One activity event's contribution, as seen by the authority at reduce time. */
export interface ActivityDelta {
  tokens: number;
  appraisal?: Appraisal;
  /** Was the session working as of its PREVIOUS event? Gates the active-time integral. */
  prevWorking: boolean;
  /** What the session was doing as of its previous event (which bucket the span lands in). */
  prevAction: PetAction;
  /** Elapsed ms since the session's previous event. */
  gapMs: number;
}

export function newActionMs(): ActionMs {
  return { shell: 0, edit: 0, read: 0, web: 0, thinking: 0, idle: 0 };
}

export function newDailyRollup(): DailyRollup {
  return {
    tokensFed: 0,
    activeMs: 0,
    actionMs: newActionMs(),
    promptQualitySum: 0,
    promptCount: 0,
  };
}

/** The UTC-day bucket an epoch-ms timestamp falls in. Day boundaries are UTC so they are
 * server-verifiable (a client can't earn a fresh "today" by changing its clock). */
export function utcDayOf(at: number): number {
  return Math.floor(at / TIME.DAY_MS);
}

/**
 * Classify one gap into exactly one effort bucket and return its capped duration. EVERY gap
 * is accounted for (nothing is dropped): a fresh working gap lands in its tool bucket — or
 * `thinking` when no specific tool was active — while a not-working or stale (>= freshness
 * window) gap lands in `idle`. Each gap is capped at `workTimeoutMs` so a long silence
 * between sessions can contribute at most one window (~60s), keeping `idle` bounded.
 */
export function effortSpan(
  prevWorking: boolean,
  prevAction: PetAction,
  gapMs: number,
): { ms: number; bucket: EffortBucket } {
  if (gapMs <= 0) return { ms: 0, bucket: "idle" };
  const capped = Math.min(gapMs, ACTIVITY.workTimeoutMs);
  if (!prevWorking || gapMs >= ACTIVITY.workTimeoutMs) return { ms: capped, bucket: "idle" };
  return { ms: gapMs, bucket: prevAction === "none" ? "thinking" : prevAction };
}

/** Fold one activity event into a day's rollup. PURE — returns a new rollup. `activeMs` is the
 * "working" half of the breakdown — every bucket except `idle`, so it never inflates with idle
 * time and the 2h-goal ring keeps its meaning. */
export function foldActivity(rollup: DailyRollup, delta: ActivityDelta): DailyRollup {
  const span = effortSpan(delta.prevWorking, delta.prevAction, delta.gapMs);
  const actionMs: ActionMs = { ...rollup.actionMs };
  actionMs[span.bucket] += span.ms;
  const workedMs = span.bucket === "idle" ? 0 : span.ms;
  return {
    tokensFed: rollup.tokensFed + (delta.tokens || 0),
    activeMs: rollup.activeMs + workedMs,
    actionMs,
    promptQualitySum: rollup.promptQualitySum + (delta.appraisal?.quality ?? 0),
    promptCount: rollup.promptCount + (delta.appraisal ? 1 : 0),
  };
}

/**
 * The time-scoped "grind" score (Today / Season / All-Time). Deliberately only the
 * order-free, per-window term (tokens): the cumulative terms in the competitive `score()` —
 * survival streak, zone achievements — are not meaningful for a single day. Reuses the shared
 * token weight so a daily point is worth the same as a lifetime point.
 */
export function dailyScore(r: Pick<DailyRollup, "tokensFed">): number {
  return Math.round(r.tokensFed * SCORING.weights.tokensFed);
}

/**
 * One day's headline numbers, as the dashboard consumes them (a thinner view of a stored
 * `dailyStats` row). Streak and record math operate on these so the same logic is testable
 * in the engine and reused by the Convex read side.
 */
export interface DayPoint {
  utcDay: number;
  tokensFed: number;
  activeMs: number;
  score: number;
}

/**
 * Weekday of a UTC-day index, 0=Sunday … 6=Saturday. Epoch day 0 (1970-01-01) was a
 * THURSDAY, so day index `d` is `(d + 4) mod 7`. Used to align the contribution heatmap's
 * rows; kept here (not `new Date().getUTCDay()`) so it's the single tested source of truth.
 */
export function dayOfWeek(utcDay: number): number {
  return (((utcDay + 4) % 7) + 7) % 7;
}

/** A day "counts" for streaks if any tokens were fed or any working time accrued. */
export function isActiveDay(d: { tokensFed: number; activeMs: number }): boolean {
  return d.tokensFed > 0 || d.activeMs > 0;
}

/** Consecutive active days ending today — or yesterday if today's grind hasn't started. */
export function currentStreak(days: DayPoint[], today: number): number {
  const active = new Set(days.filter(isActiveDay).map((d) => d.utcDay));
  let day = active.has(today) ? today : today - 1;
  let streak = 0;
  while (active.has(day)) {
    streak++;
    day--;
  }
  return streak;
}

/** Longest run of consecutive active days anywhere in history. */
export function longestStreak(days: DayPoint[]): number {
  const active = [...new Set(days.filter(isActiveDay).map((d) => d.utcDay))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const day of active) {
    run = day === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

/** The single best day by score; ties resolve to the more recent day. Null if no active day. */
export function bestDay(days: DayPoint[]): { utcDay: number; score: number } | null {
  let best: { utcDay: number; score: number } | null = null;
  for (const d of days) {
    if (d.score <= 0) continue;
    if (!best || d.score > best.score || (d.score === best.score && d.utcDay > best.utcDay)) {
      best = { utcDay: d.utcDay, score: d.score };
    }
  }
  return best;
}

/** Aggregate many day rollups into one (Season = this month's rows, All-Time = all rows). */
export function sumDailies(rows: DailyRollup[]): DailyRollup {
  return rows.reduce((acc, r) => {
    acc.tokensFed += r.tokensFed;
    acc.activeMs += r.activeMs;
    acc.actionMs.shell += r.actionMs.shell;
    acc.actionMs.edit += r.actionMs.edit;
    acc.actionMs.read += r.actionMs.read;
    acc.actionMs.web += r.actionMs.web;
    acc.actionMs.thinking += r.actionMs.thinking;
    acc.actionMs.idle += r.actionMs.idle;
    acc.promptQualitySum += r.promptQualitySum;
    acc.promptCount += r.promptCount;
    return acc;
  }, newDailyRollup());
}
