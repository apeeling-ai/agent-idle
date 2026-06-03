/**
 * Rate ceilings. Events arriving faster than a human + Claude could plausibly
 * produce are flagged (accepted=false) rather than reduced — a cheap anti-cheat
 * floor. These are deliberately generous; tighten with real data.
 */

export const RATE = {
  /** Max feed events credited per minute per account. */
  maxFeedsPerMinute: 30,
  /** Max tokens credited per single feed event. */
  maxTokensPerFeed: 2_000_000,
  /** Max lines credited per single feed event. */
  maxLinesPerFeed: 5_000,
} as const;

export interface RateContext {
  feedsInLastMinute: number;
  tokens: number;
  linesAuthored: number;
}

/** Returns null if within ceilings, else a reason string. Pure. */
export function rateViolation(ctx: RateContext): string | null {
  if (ctx.feedsInLastMinute > RATE.maxFeedsPerMinute) return "feed-rate-exceeded";
  if (ctx.tokens > RATE.maxTokensPerFeed) return "tokens-per-feed-exceeded";
  if (ctx.linesAuthored > RATE.maxLinesPerFeed) return "lines-per-feed-exceeded";
  return null;
}
