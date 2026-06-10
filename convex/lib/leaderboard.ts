/**
 * Ordered aggregate over `dailyStats` — namespaced per UTC day, sorted by `cachedDailyScore`.
 *
 * Gives the daily leaderboard two things the `by_day_score` index cannot do cheaply for an account
 * OUTSIDE the fetched top page: its EXACT rank (`indexOf`, O(log n)) and the day's total player
 * count (`count`). Top-N entries still come straight off the index — this is used only where a
 * scan would otherwise be unbounded (the old code counted "ahead within the top 50", so anyone
 * past rank 50 got a wrong, capped rank).
 *
 * Kept in sync on EVERY dailyStats write (lib/rollup.ts), inside the same atomic mutation. It
 * spans ALL active accounts for the day (public + private): the visible board filters to public,
 * but a caller's rank is their true standing among everyone who was active that day.
 */
import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const dailyLeaderboard = new TableAggregate<{
  Namespace: number; // utcDay
  Key: number; // cachedDailyScore
  DataModel: DataModel;
  TableName: "dailyStats";
}>(components.dailyLeaderboard, {
  namespace: (doc) => doc.utcDay,
  sortKey: (doc) => doc.cachedDailyScore,
});

/**
 * Rebuild the aggregate from the current `dailyStats` table: clear each day it knows about, then
 * re-insert every row. Used by the one-shot backfill and the dev maintenance resets so the
 * aggregate never drifts from the table. Idempotent.
 */
export async function resetLeaderboardAggregate(ctx: MutationCtx): Promise<number> {
  const rows = await ctx.db.query("dailyStats").collect();
  const days = new Set(rows.map((r) => r.utcDay));
  for (const day of days) await dailyLeaderboard.clear(ctx, { namespace: day });
  for (const row of rows) await dailyLeaderboard.insertIfDoesNotExist(ctx, row);
  return rows.length;
}
