/**
 * OPTIONAL maintenance. There is NO per-entity tick — liveness is derived via
 * engine.decay at every read/reduce. This sweep exists ONLY for side effects that
 * need to fire when nobody is watching (death notifications, hard leaderboard
 * purge). It is a cheap, low-frequency batch over ONLY stale rows — not the tick.
 *
 * STUB and OFF by default (see crons.ts).
 */

import { internalMutation } from "./_generated/server";

export const sweepStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Only touch rows untouched for a long time — derived liveness already handles
    // everything else lazily. TODO: emit death notifications, purge from boards.
    const staleBefore = now - 30 * 24 * 60 * 60 * 1000; // 30 days
    const stale = await ctx.db
      .query("entities")
      .withIndex("by_lastUpdated", (q) => q.lt("lastUpdated", staleBefore))
      .take(100);
    // TODO: act on `stale`. Intentionally a no-op in the scaffold.
    return { scanned: stale.length };
  },
});
