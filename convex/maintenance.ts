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

/**
 * Dev convenience: hard-delete EVERY pet row (a clean overview reset). Unlike sweepStale
 * this ignores liveness — it removes live pets too. Active Claude Code sessions will
 * respawn their own pet on the next event; this just clears the accumulated clutter.
 */
export const clearAllPets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("entities").collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return { removed: rows.length };
  },
});

/**
 * Dev convenience: remove throwaway pets created by manual hook injection (sessionIds
 * prefixed `debug-`, or the `nudge` probe). Real session pets (UUID sessionIds) are left
 * untouched, so it's safe to run on a live account to clear test clutter.
 */
export const clearTestPets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("entities").collect();
    let removed = 0;
    for (const row of rows) {
      if (row.sessionId.startsWith("debug-") || row.sessionId === "nudge") {
        await ctx.db.delete(row._id);
        removed++;
      }
    }
    return { removed };
  },
});

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
