/**
 * The credible-state pipeline. Clients NEVER write totals — they POST events here;
 * this mutation authenticates the caller via Convex Auth, then validates and reduces
 * the event with the shared @agent-idle/engine. `getAccountState` is the reactive read
 * every client (laptop, phone, leaderboard) subscribes to.
 *
 * Trust model: identity is the authenticated GitHub user (ctx.auth). No HMAC — the old
 * per-account secret is gone. Rate ceilings still apply as an anti-cheat floor.
 */

import { apply, decay, evaluateUnlocks, score, toTrainerStats, type Event } from "@agent-idle/engine";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentAccount, ensureAccount } from "./lib/auth";
import { rowToEntity } from "./lib/entity";
import { rateViolation } from "./lib/rate";

function toEngineEvent(
  type: "feed" | "pet",
  payload: any,
  at: number,
  clientEventId: string,
): Event {
  if (type === "feed") {
    return {
      type: "feed",
      at,
      clientEventId,
      appraisal: payload.appraisal,
      tokens: payload.tokens ?? 0,
      linesAuthored: payload.linesAuthored ?? 0,
    };
  }
  return { type: "pet", at, clientEventId };
}

export const ingestEvent = mutation({
  args: {
    type: v.union(v.literal("feed"), v.literal("pet")),
    source: v.string(),
    // Numeric payload only — appraisal numbers + counts. NEVER prompt text / code.
    payload: v.any(),
    clientEventId: v.string(),
    /** Advisory only; the server stamps the authoritative `at`. */
    clientAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Authenticated caller → their account (created on first event).
    const account = await ensureAccount(ctx);

    // 1. Idempotent dedup by clientEventId.
    const existing = await ctx.db
      .query("eventLedger")
      .withIndex("by_clientEventId", (q) => q.eq("clientEventId", args.clientEventId))
      .first();
    if (existing) {
      return { deduped: true, accepted: existing.accepted };
    }

    const now = Date.now(); // SERVER-stamped authoritative time

    // 2. Reject/flag events past human + Claude rate ceilings.
    const tokens = args.type === "feed" ? (args.payload?.tokens ?? 0) : 0;
    const linesAuthored = args.type === "feed" ? (args.payload?.linesAuthored ?? 0) : 0;
    const recent = await ctx.db
      .query("eventLedger")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();
    const oneMinuteAgo = now - 60_000;
    const feedsInLastMinute = recent.filter((e) => e.type === "feed" && e.at >= oneMinuteAgo).length;
    const violation = rateViolation({ feedsInLastMinute, tokens, linesAuthored });
    const accepted = violation === null;

    // 3. Append to the append-only ledger (server-stamped `at`).
    await ctx.db.insert("eventLedger", {
      accountId: account._id,
      type: args.type,
      source: args.source,
      payload: args.payload,
      at: now,
      clientEventId: args.clientEventId,
      accepted,
      rejectedReason: violation ?? undefined,
    });

    if (!accepted) {
      return { deduped: false, accepted: false, reason: violation };
    }

    // 4. Reduce: decay to `now` THEN apply the event (engine does both), write derived state.
    const entityRow = await ctx.db
      .query("entities")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .first();
    if (!entityRow) throw new Error("account has no entity");

    const engineEntity = rowToEntity(entityRow);
    const event = toEngineEvent(args.type, args.payload, now, args.clientEventId);

    const season = apply({ entity: engineEntity, stats: account.seasonStats }, event);
    // Lifetime totals reduce identically; we keep only the stats (entity is discarded).
    const lifetime = apply({ entity: engineEntity, stats: account.lifetimeStats }, event);
    const live = decay(season.entity, now);

    await ctx.db.patch(entityRow._id, {
      resources: season.entity.resources,
      cosmetics: season.entity.cosmetics,
      lastUpdated: season.entity.lastUpdated,
      cachedStatus: live.status,
      cachedAlive: live.alive,
    });
    await ctx.db.patch(account._id, {
      seasonStats: season.stats,
      lifetimeStats: lifetime.stats,
    });

    return { deduped: false, accepted: true, status: live.status };
  },
});

export const getAccountState = query({
  args: {},
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) return null; // unauthenticated or not yet created

    const entityRow = await ctx.db
      .query("entities")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .first();
    if (!entityRow) return null;

    const now = Date.now();
    const entity = rowToEntity(entityRow);
    const live = decay(entity, now); // lazy decay AT READ TIME — this is the realtime sync
    const trainerStats = toTrainerStats(account.seasonStats);

    return {
      account: {
        githubLogin: account.githubLogin ?? null,
        visibility: account.visibility,
        verified: account.verified,
      },
      entity: { ...entity, resources: live.resources },
      liveness: live,
      stats: account.seasonStats,
      trainerStats,
      score: score(trainerStats),
      unlocks: evaluateUnlocks(trainerStats),
      updatedAt: entityRow.lastUpdated,
    };
  },
});
