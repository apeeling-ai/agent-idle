/**
 * The credible-state pipeline. Clients NEVER write totals — they POST events here;
 * this mutation authenticates the caller via Convex Auth, then validates and reduces
 * the event with the shared @agent-idle/engine. `getPlayerState` is the reactive read
 * every client (laptop, phone, leaderboard) subscribes to.
 *
 * One pet = one Claude Code session. Events carry a `sessionId`; the authority routes
 * each to the matching pet, spawning it on first sight (`register`, or an `activity`
 * that beats its register). There is NO manual feed/pet — energy comes only from usage.
 *
 * Trust model: identity is the authenticated GitHub user (ctx.auth). No HMAC. Rate
 * ceilings still apply as an anti-cheat floor.
 */

import {
  apply,
  decay,
  evaluateUnlocks,
  newEntity,
  newStats,
  score,
  toTrainerStats,
  type Event,
} from "@agent-idle/engine";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentAccount, ensureAccount } from "./lib/auth";
import { rowToEntity } from "./lib/entity";
import { rateViolation } from "./lib/rate";
import { spawnFields } from "./lib/spawn";

function toEngineEvent(
  type: "register" | "activity",
  sessionId: string,
  payload: any,
  at: number,
  clientEventId: string,
): Event {
  if (type === "register") {
    return { type: "register", sessionId, at, clientEventId };
  }
  return {
    type: "activity",
    sessionId,
    at,
    clientEventId,
    working: payload?.working ?? false,
    appraisal: payload?.appraisal,
    tokens: payload?.tokens ?? 0,
    linesAuthored: payload?.linesAuthored ?? 0,
  };
}

export const ingestEvent = mutation({
  args: {
    type: v.union(v.literal("register"), v.literal("activity")),
    /** The Claude Code session this event belongs to (one pet per session). */
    sessionId: v.string(),
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
    const isActivity = args.type === "activity";

    // 2. Reject/flag activity events past human + Claude rate ceilings.
    const tokens = isActivity ? (args.payload?.tokens ?? 0) : 0;
    const linesAuthored = isActivity ? (args.payload?.linesAuthored ?? 0) : 0;
    let activitiesInLastMinute = 0;
    if (isActivity) {
      const recent = await ctx.db
        .query("eventLedger")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();
      const oneMinuteAgo = now - 60_000;
      activitiesInLastMinute = recent.filter(
        (e) => e.type === "activity" && e.at >= oneMinuteAgo,
      ).length;
    }
    const violation = isActivity
      ? rateViolation({ activitiesInLastMinute, tokens, linesAuthored })
      : null;
    const accepted = violation === null;

    // 3. Append to the append-only ledger (server-stamped `at`).
    await ctx.db.insert("eventLedger", {
      accountId: account._id,
      type: args.type,
      sessionId: args.sessionId,
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

    // 4. Find the pet for this session; spawn it on first sight (server-chosen identity).
    let petRow = await ctx.db
      .query("entities")
      .withIndex("by_account_session", (q) =>
        q.eq("accountId", account._id).eq("sessionId", args.sessionId),
      )
      .first();

    if (!petRow) {
      const { species, name } = spawnFields(args.sessionId);
      const entityId = crypto.randomUUID();
      const fresh = newEntity({ id: entityId, sessionId: args.sessionId, name, species, now });
      const petId = await ctx.db.insert("entities", {
        accountId: account._id,
        entityId,
        sessionId: args.sessionId,
        species: fresh.species,
        name: fresh.name,
        resources: fresh.resources,
        cosmetics: fresh.cosmetics,
        mode: fresh.mode,
        lastUpdated: fresh.lastUpdated,
        workingUntil: fresh.workingUntil,
        stats: newStats(),
        cachedStatus: "lively",
        cachedActivity: "active",
        cachedAlive: true,
      });
      petRow = (await ctx.db.get(petId))!;
    }

    // 5. Reduce: decay to `now` THEN apply the event (engine does both), write derived state.
    const engineEntity = rowToEntity(petRow);
    const event = toEngineEvent(args.type, args.sessionId, args.payload, now, args.clientEventId);

    const reduced = apply({ entity: engineEntity, stats: petRow.stats }, event);
    const live = decay(reduced.entity, now);

    await ctx.db.patch(petRow._id, {
      resources: reduced.entity.resources,
      cosmetics: reduced.entity.cosmetics,
      lastUpdated: reduced.entity.lastUpdated,
      workingUntil: reduced.entity.workingUntil,
      stats: reduced.stats,
      cachedStatus: live.status,
      cachedActivity: live.activity,
      cachedAlive: live.alive,
    });

    // Account-level aggregate (across all pets) — only `activity` adds to it.
    const season = apply({ entity: engineEntity, stats: account.seasonStats }, event).stats;
    const lifetime = apply({ entity: engineEntity, stats: account.lifetimeStats }, event).stats;
    await ctx.db.patch(account._id, { seasonStats: season, lifetimeStats: lifetime });

    return { deduped: false, accepted: true, status: live.status, activity: live.activity };
  },
});

export const getPlayerState = query({
  args: {},
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) return null; // unauthenticated or not yet created

    const now = Date.now();
    const rows = await ctx.db
      .query("entities")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();

    // Lazy decay AT READ TIME for every pet — this is the realtime sync.
    const pets = rows
      .map((row) => {
        const entity = rowToEntity(row);
        const live = decay(entity, now);
        const trainerStats = toTrainerStats(row.stats);
        return {
          // RAW snapshot (energy at lastUpdated) so clients can re-decay on a clock
          // tick for a live active→idle transition. `liveness` is the server's read.
          entity,
          liveness: live,
          stats: row.stats,
          trainerStats,
          score: score(trainerStats),
          unlocks: evaluateUnlocks(trainerStats),
          updatedAt: row.lastUpdated,
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt); // most recently active first

    const aggregate = toTrainerStats(account.seasonStats);

    return {
      account: {
        githubLogin: account.githubLogin ?? null,
        visibility: account.visibility,
        verified: account.verified,
      },
      pets,
      stats: account.seasonStats,
      trainerStats: aggregate,
      score: score(aggregate),
      updatedAt: now,
    };
  },
});
