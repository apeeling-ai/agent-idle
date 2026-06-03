/**
 * OPTIONAL maintenance. There is NO per-entity tick — liveness is derived via
 * engine.decay at every read/reduce. This sweep exists ONLY for side effects that
 * need to fire when nobody is watching (death notifications, hard leaderboard
 * purge). It is a cheap, low-frequency batch over ONLY stale rows — not the tick.
 *
 * STUB and OFF by default (see crons.ts).
 */

import { decay } from "@agent-idle/engine";
import { internalMutation } from "./_generated/server";
import { rowToEntity } from "./lib/entity";

export const sweepStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Only touch rows untouched for a long time — derived liveness already handles
    // everything else lazily (getPlayerState hides "gone" pets the instant they cross the
    // removal grace). This pass reclaims those rows. TODO: emit death notifications.
    const staleBefore = now - 30 * 24 * 60 * 60 * 1000; // 30 days
    const stale = await ctx.db
      .query("entities")
      .withIndex("by_lastUpdated", (q) => q.lt("lastUpdated", staleBefore))
      .take(100);
    // Hard-delete only the ones the engine considers removed — never a live/recoverable pet.
    let removed = 0;
    for (const row of stale) {
      if (decay(rowToEntity(row), now).gone) {
        await ctx.db.delete(row._id);
        removed++;
      }
    }
    return { scanned: stale.length, removed };
  },
});
