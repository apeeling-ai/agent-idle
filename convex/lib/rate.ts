/**
 * Rate ceilings. Events arriving faster than a human + Claude could plausibly
 * produce are flagged (accepted=false) rather than reduced — a cheap anti-cheat
 * floor. These are deliberately generous; tighten with real data.
 */

export const RATE = {
  /** Max activity events credited per minute per account (across all sessions). */
  maxActivitiesPerMinute: 60,
  /** Max tokens credited per single activity event. */
  maxTokensPerActivity: 2_000_000,
  /** Max lines credited per single activity event. */
  maxLinesPerActivity: 5_000,
} as const;

export interface RateContext {
  activitiesInLastMinute: number;
  tokens: number;
  linesAuthored: number;
}

/** Returns null if within ceilings, else a reason string. Pure. */
export function rateViolation(ctx: RateContext): string | null {
  if (ctx.activitiesInLastMinute > RATE.maxActivitiesPerMinute) return "activity-rate-exceeded";
  if (ctx.tokens > RATE.maxTokensPerActivity) return "tokens-per-activity-exceeded";
  if (ctx.linesAuthored > RATE.maxLinesPerActivity) return "lines-per-activity-exceeded";
  return null;
}
