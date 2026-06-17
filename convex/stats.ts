/**
 * Read side of the gamification dashboard. All queries are identity-scoped via
 * `currentAccount` and return NUMERIC stats only (privacy stays structural — no prompt
 * text / code ever existed to leak). Aggregation + scoring reuse the shared engine
 * helpers so the dashboard never disagrees with the authority.
 */

import {
  type DailyRollup,
  TIME,
  bestDay,
  currentStreak,
  dailyScore,
  decay,
  decorationForSeason,
  longestStreak,
  podiumFor,
  seasonIndexOf,
  seasonStartDay,
  sumDailies,
  utcDayOf,
} from "@agent-idle/engine";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { rowToEntity } from "./lib/entity";
import { query } from "./_generated/server";
import { currentAccount } from "./lib/auth";
import { dailyLeaderboard, seasonLeaderboard } from "./lib/leaderboard";

/** Strip a stored row down to the engine's additive rollup shape. */
function toRollup(row: Doc<"dailyStats">): DailyRollup {
  return {
    tokensFed: row.tokensFed,
    activeMs: row.activeMs,
    actionMs: row.actionMs,
    promptQualitySum: row.promptQualitySum,
    promptCount: row.promptCount,
  };
}

/** First UTC day of the 2-week season `now` falls in — the lower bound of the season window. */
function startOfSeasonDay(now: number): number {
  return seasonStartDay(seasonIndexOf(utcDayOf(now)));
}

/**
 * The whole dashboard's number feed for the accumulation/streaks redesign: Today / Season /
 * All-Time rollups + scores, current & longest streaks, the best day on record, and a long
 * per-day series (`days`) that powers both the contribution heatmap and the trend bars on the
 * client — one round trip, no second subscription. Reactive — recomputes as new turns land,
 * but only per-turn (never per second), so nothing churns at rest.
 */
export const getStatsOverview = query({
  args: {},
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) return null;

    const now = Date.now();
    const today = utcDayOf(now);
    const seasonStart = startOfSeasonDay(now);

    // Bounded: a year+ of days. Rows are sparse (one per ACTIVE day), so 400 already exceeds a
    // year of real activity; the heatmap fills inactive gaps client-side. Ascending by utcDay.
    const rows = await ctx.db
      .query("dailyStats")
      .withIndex("by_account_day", (q) => q.eq("accountId", account._id))
      .take(400);

    const todayRow = rows.find((r) => r.utcDay === today) ?? null;
    const todayRollup = todayRow ? toRollup(todayRow) : null;
    const season = sumDailies(rows.filter((r) => r.utcDay >= seasonStart).map(toRollup));
    const lifetime = sumDailies(rows.map(toRollup));

    // The full per-day series the client derives heatmap / trend / records from.
    const days = rows
      .map((r) => ({
        utcDay: r.utcDay,
        tokensFed: r.tokensFed,
        activeMs: r.activeMs,
        actionMs: r.actionMs,
        score: r.cachedDailyScore,
      }))
      .sort((a, b) => a.utcDay - b.utcDay);

    // The caller's live standing on BOTH boards, so the always-visible chip can show rank without
    // subscribing to the heavier leaderboard queries. EXACT + global (O(log n) via the aggregates),
    // ranking across all active accounts in the window — same trick the board queries use.
    let dailyRank: { rank: number; total: number } | null = null;
    if (todayRow) {
      const ahead = await dailyLeaderboard.indexOf(ctx, todayRow.cachedDailyScore, {
        namespace: today,
        order: "desc",
      });
      const total = await dailyLeaderboard.count(ctx, { namespace: today });
      dailyRank = { rank: ahead + 1, total };
    }

    const seasonIdx = seasonIndexOf(today);
    const seasonRow = await ctx.db
      .query("seasonStats")
      .withIndex("by_account_season", (q) => q.eq("accountId", account._id).eq("season", seasonIdx))
      .unique();
    let seasonRank: { rank: number; total: number } | null = null;
    if (seasonRow) {
      const ahead = await seasonLeaderboard.indexOf(ctx, seasonRow.cachedSeasonScore, {
        namespace: seasonIdx,
        order: "desc",
      });
      const total = await seasonLeaderboard.count(ctx, { namespace: seasonIdx });
      seasonRank = { rank: ahead + 1, total };
    }

    return {
      today: todayRollup,
      season,
      lifetime,
      todayScore: todayRollup ? dailyScore(todayRollup) : 0,
      seasonScore: dailyScore(season),
      lifetimeScore: dailyScore(lifetime),
      dailyRank,
      seasonRank,
      streak: currentStreak(days, today),
      longestStreak: longestStreak(days),
      bestDay: bestDay(days),
      daysActive: days.length,
      days,
      utcDay: today,
      season_index: seasonIdx,
    };
  },
});

/**
 * Today's daily leaderboard — public accounts ranked by daily score, plus the caller's
 * own score and best-effort rank within the fetched page. Sorted on the by_day_score index.
 */
export const getDailyLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    const now = Date.now();
    const today = utcDayOf(now);
    const limit = Math.min(args.limit ?? 20, 50);

    // Top scorers today (over-fetch so private accounts can be filtered out).
    const top = await ctx.db
      .query("dailyStats")
      .withIndex("by_day_score", (q) => q.eq("utcDay", today))
      .order("desc")
      .take(50);

    // Ranked by cachedDailyScore (the index) — which is tokens-dominated — but we surface
    // TOKENS as the figure, since that's the metric the product speaks in.
    const entries: { name: string; tokens: number; isYou: boolean }[] = [];
    for (const row of top) {
      const acct = await ctx.db.get(row.accountId);
      if (!acct) continue;
      const isYou = account ? acct._id === account._id : false;
      if (acct.visibility !== "public" && !isYou) continue; // private hidden (except you)
      entries.push({
        name: acct.githubLogin ?? "anonymous",
        tokens: row.tokensFed,
        isYou,
      });
      if (entries.length >= limit) break;
    }

    // The caller's own standing. EXACT and global (works even when they're far outside the fetched
    // page): the aggregate counts, in O(log n), how many of today's players outscore them. Ranks
    // across all active accounts that day — the visible board is public-only, but your rank is your
    // true standing among everyone. (Old code counted "ahead within the top 50", so rank capped at 50.)
    let you: { tokens: number; rank: number; total: number } | null = null;
    if (account) {
      const myRow = await ctx.db
        .query("dailyStats")
        .withIndex("by_account_day", (q) => q.eq("accountId", account._id).eq("utcDay", today))
        .unique();
      if (myRow) {
        const ahead = await dailyLeaderboard.indexOf(ctx, myRow.cachedDailyScore, {
          namespace: today,
          order: "desc",
        });
        const total = await dailyLeaderboard.count(ctx, { namespace: today });
        you = { tokens: myRow.tokensFed, rank: ahead + 1, total };
      }
    }

    return { entries, you, utcDay: today };
  },
});

/**
 * The current 2-week season's leaderboard — the season twin of `getDailyLeaderboard`. Public
 * accounts ranked by season score (tokens accumulated since the season boundary), plus the
 * caller's own exact global rank via the `seasonLeaderboard` aggregate. Sorted on by_season_score.
 */
export const getSeasonLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    const now = Date.now();
    const season = seasonIndexOf(utcDayOf(now));
    const limit = Math.min(args.limit ?? 20, 50);

    // Top scorers this season (over-fetch so private accounts can be filtered out).
    const top = await ctx.db
      .query("seasonStats")
      .withIndex("by_season_score", (q) => q.eq("season", season))
      .order("desc")
      .take(50);

    const entries: { name: string; tokens: number; isYou: boolean }[] = [];
    for (const row of top) {
      const acct = await ctx.db.get(row.accountId);
      if (!acct) continue;
      const isYou = account ? acct._id === account._id : false;
      if (acct.visibility !== "public" && !isYou) continue; // private hidden (except you)
      entries.push({ name: acct.githubLogin ?? "anonymous", tokens: row.tokensFed, isYou });
      if (entries.length >= limit) break;
    }

    // The caller's own standing — EXACT and global, even when outside the fetched page (same
    // O(log n) aggregate trick as the daily board, scoped to this season's namespace).
    let you: { tokens: number; rank: number; total: number } | null = null;
    if (account) {
      const myRow = await ctx.db
        .query("seasonStats")
        .withIndex("by_account_season", (q) => q.eq("accountId", account._id).eq("season", season))
        .unique();
      if (myRow) {
        const ahead = await seasonLeaderboard.indexOf(ctx, myRow.cachedSeasonScore, {
          namespace: season,
          order: "desc",
        });
        const total = await seasonLeaderboard.count(ctx, { namespace: season });
        you = { tokens: myRow.tokensFed, rank: ahead + 1, total };
      }
    }

    // When this season ends (the first ms of the next season) + what a podium finish wins, so the
    // client can show a countdown and the 1/2/3 reward preview without its own season math.
    const seasonEndsAt = seasonStartDay(season + 1) * TIME.DAY_MS;
    const prize = decorationForSeason(season);
    const reward = { kind: prize.kind, glyph: prize.glyph, label: prize.label };

    return { entries, you, season, seasonEndsAt, reward };
  },
});

/**
 * The account's earned season trophies — one decoration per PAST season the player actually scored
 * in, hung on the cabin in the diorama. Purely DERIVED from the season rollups (no award table, no
 * end-of-season job): a season counts the moment the current season index has advanced past it.
 * Oldest → newest. Bounded by the number of seasons the account has been active.
 */
export const getSeasonDecorations = query({
  args: {},
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) return [];

    const current = seasonIndexOf(utcDayOf(Date.now()));
    const rows = await ctx.db
      .query("seasonStats")
      .withIndex("by_account_season", (q) => q.eq("accountId", account._id))
      .collect();

    // One trophy per past season the player scored in (the themed ornament). A top-3 FINISH in that
    // season also earns a medal badge — the final rank is still queryable, since the aggregate keeps
    // every past season's namespace. Oldest → newest.
    const earned = rows.filter((r) => r.season < current && r.tokensFed > 0).sort((a, b) => a.season - b.season);
    const out: {
      season: number;
      kind: string;
      glyph: string;
      label: string;
      rank: number;
      medal: { glyph: string; label: string } | null;
      tokens: number;
    }[] = [];
    for (const r of earned) {
      const ahead = await seasonLeaderboard.indexOf(ctx, r.cachedSeasonScore, {
        namespace: r.season,
        order: "desc",
      });
      const rank = ahead + 1;
      const medal = podiumFor(rank);
      const d = decorationForSeason(r.season);
      out.push({
        season: r.season,
        kind: d.kind,
        glyph: d.glyph,
        label: d.label,
        rank,
        medal: medal ? { glyph: medal.glyph, label: medal.label } : null,
        tokens: r.tokensFed,
      });
    }
    return out;
  },
});

/**
 * The account's own pets (Claude Code sessions), ranked by lifetime tokens — the "hall of fame".
 * ALL-TIME, so it includes dead/idle pets (not just the live menagerie); liveness is decayed at
 * read for an accurate status dot. Numeric + names only. Bounded by the account's pet count.
 */
export const getTopPets = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    if (!account) return [];

    const now = Date.now();
    const limit = Math.min(args.limit ?? 50, 200);
    // Read only the top-N by lifetime tokens straight off the index (descending) instead of
    // loading every pet the account ever ran and sorting in JS — bounds the read to the page.
    const rows = await ctx.db
      .query("entities")
      .withIndex("by_account_tokens", (q) => q.eq("accountId", account._id))
      .order("desc")
      .take(limit);

    const zero = { shell: 0, edit: 0, read: 0, web: 0, thinking: 0, idle: 0 };
    return rows.map((row) => {
      const live = decay(rowToEntity(row), now);
      return {
        name: row.name,
        species: row.species,
        tokensFed: row.stats.tokensFed,
        promptCount: row.stats.promptCount,
        promptQualitySum: row.stats.promptQualitySum,
        actionMs: row.actionMs ?? zero,
        status: live.status,
        alive: live.alive,
        activity: live.activity,
        bornAt: row._creationTime,
        lastUpdated: row.lastUpdated,
      };
    });
  },
});
