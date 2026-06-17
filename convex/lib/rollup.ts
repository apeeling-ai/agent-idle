/**
 * Daily-rollup write helper. The eventLedger is the source of truth; this folds each
 * accepted activity event into the per-(account, UTC day) `dailyStats` row using the
 * shared engine math (engine.foldActivity / dailyScore), so the dashboard's aggregates
 * are derived identically to everything else. The server is the only writer.
 */

import {
  type ActivityDelta,
  dailyScore,
  foldActivity,
  newDailyRollup,
  seasonIndexOf,
  utcDayOf,
} from "@agent-idle/engine";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { dailyLeaderboard, seasonLeaderboard } from "./leaderboard";

/** Fold one activity event into BOTH the per-day and per-season rollups for an account, keeping
 * each table's leaderboard aggregate in sync inside the same atomic mutation. The two buckets
 * accumulate the SAME deltas with identical engine math — they differ only in window length. */
export async function upsertRollups(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  now: number,
  delta: ActivityDelta,
): Promise<void> {
  await upsertDailyRollup(ctx, accountId, now, delta);
  await upsertSeasonRollup(ctx, accountId, now, delta);
}

/** Upsert today's rollup for an account with one activity event's contribution. */
async function upsertDailyRollup(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  now: number,
  delta: ActivityDelta,
): Promise<void> {
  const utcDay = utcDayOf(now);
  const row = await ctx.db
    .query("dailyStats")
    .withIndex("by_account_day", (q) => q.eq("accountId", accountId).eq("utcDay", utcDay))
    .unique();

  const base = row
    ? {
        tokensFed: row.tokensFed,
        activeMs: row.activeMs,
        actionMs: row.actionMs,
        promptQualitySum: row.promptQualitySum,
        promptCount: row.promptCount,
      }
    : newDailyRollup();

  const next = foldActivity(base, delta);
  const cachedDailyScore = dailyScore(next);

  if (row) {
    await ctx.db.patch(row._id, { ...next, cachedDailyScore });
    const newDoc = await ctx.db.get(row._id);
    // replaceOrInsert (not replace) so a row that predates the aggregate still lands correctly
    // during the backfill window — migration-safe.
    if (newDoc) await dailyLeaderboard.replaceOrInsert(ctx, row, newDoc);
  } else {
    const id = await ctx.db.insert("dailyStats", { accountId, utcDay, ...next, cachedDailyScore });
    const doc = await ctx.db.get(id);
    if (doc) await dailyLeaderboard.insertIfDoesNotExist(ctx, doc);
  }
}

/** Upsert the current season's rollup for an account — the season twin of upsertDailyRollup. */
async function upsertSeasonRollup(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  now: number,
  delta: ActivityDelta,
): Promise<void> {
  const season = seasonIndexOf(utcDayOf(now));
  const row = await ctx.db
    .query("seasonStats")
    .withIndex("by_account_season", (q) => q.eq("accountId", accountId).eq("season", season))
    .unique();

  const base = row
    ? {
        tokensFed: row.tokensFed,
        activeMs: row.activeMs,
        actionMs: row.actionMs,
        promptQualitySum: row.promptQualitySum,
        promptCount: row.promptCount,
      }
    : newDailyRollup();

  const next = foldActivity(base, delta);
  const cachedSeasonScore = dailyScore(next);

  if (row) {
    await ctx.db.patch(row._id, { ...next, cachedSeasonScore });
    const newDoc = await ctx.db.get(row._id);
    if (newDoc) await seasonLeaderboard.replaceOrInsert(ctx, row, newDoc);
  } else {
    const id = await ctx.db.insert("seasonStats", { accountId, season, ...next, cachedSeasonScore });
    const doc = await ctx.db.get(id);
    if (doc) await seasonLeaderboard.insertIfDoesNotExist(ctx, doc);
  }
}
