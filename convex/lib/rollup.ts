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
  utcDayOf,
} from "@agent-idle/engine";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Upsert today's rollup for an account with one activity event's contribution. */
export async function upsertDailyRollup(
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
  } else {
    await ctx.db.insert("dailyStats", { accountId, utcDay, ...next, cachedDailyScore });
  }
}
