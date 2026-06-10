/**
 * Rate ceilings. Events arriving faster than a human + Claude could plausibly
 * produce are flagged (accepted=false) rather than reduced — a cheap anti-cheat
 * floor. These are deliberately generous; tighten with real data.
 */

export const RATE = {
  /**
   * Max activity events credited per minute per account, ACROSS ALL SESSIONS. Generous
   * because many agents can work simultaneously — each renews its "working" signal plus
   * fires tool-use hooks — so this scales with concurrent-session count, not one human.
   */
  maxActivitiesPerMinute: 600,
  /**
   * Max tokens credited per single activity event (one finished turn). Counts FULL
   * throughput incl. cache reads — in Claude Code the whole context is re-read from cache
   * every turn, so a single long agentic turn legitimately runs tens of millions of tokens
   * (observed ~28M in one turn). Kept generous so real turns are credited; it's a sanity
   * floor against absurd spoofing, not hard security (local usage is inherently self-reported).
   */
  maxTokensPerActivity: 200_000_000,
} as const;

export interface RateContext {
  activitiesInLastMinute: number;
  tokens: number;
}

/** Returns null if within ceilings, else a reason string. Pure. */
export function rateViolation(ctx: RateContext): string | null {
  if (ctx.activitiesInLastMinute > RATE.maxActivitiesPerMinute) return "activity-rate-exceeded";
  if (ctx.tokens > RATE.maxTokensPerActivity) return "tokens-per-activity-exceeded";
  return null;
}
