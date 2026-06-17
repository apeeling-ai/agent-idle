/**
 * The credible-state pipeline. Clients NEVER write totals — they POST events here;
 * this mutation authenticates the caller via Convex Auth, then validates and reduces
 * the event with the shared @agent-idle/engine. `getPlayerState` is the reactive read
 * every client (laptop, phone, leaderboard) subscribes to.
 *
 * One pet = one Claude Code session. Events carry a `sessionId`; the authority routes
 * each to the matching pet, spawning it on the first `activity` event (real work). A bare
 * `register` (SessionStart / opening a session) only WAKES an existing pet — it never
 * spawns one, so phantom pets can't appear from sessions that did no work. There is NO
 * manual feed/pet — energy, and existence itself, come only from usage.
 *
 * Trust model: identity is the authenticated GitHub user (ctx.auth). No HMAC. Rate
 * ceilings still apply as an anti-cheat floor.
 */

import {
  apply,
  decay,
  effortSpan,
  evaluateUnlocks,
  maxLifespanMs,
  newActionMs,
  newEntity,
  newStats,
  score,
  sumDailies,
  toTrainerStats,
  type Event,
} from "@agent-idle/engine";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentAccount, ensureAccount } from "./lib/auth";
import { rowToEntity } from "./lib/entity";
import { rateViolation } from "./lib/rate";
import { upsertRollups } from "./lib/rollup";
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
    waiting: payload?.waiting ?? "none",
    action: payload?.action ?? "none",
    failed: payload?.failed ?? false,
    ended: payload?.ended ?? false,
    appraisal: payload?.appraisal,
    tokens: payload?.tokens ?? 0,
  };
}

/** Coerce a value the server credits into authoritative totals to a finite, non-negative number.
 * `payload` is `v.any()` (numeric-by-contract), but a malformed or hostile client could send
 * NaN / a negative / a non-number for `tokens` — and the rate check `tokens > max` is FALSE for
 * all of those, so they slip through. Unchecked they flow into `lifetimeTokens` and the SHARED,
 * cross-account leaderboard sort key, poisoning rank math for everyone in that namespace. */
function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** Sanitize an activity payload's numeric fields before they reach the rate check, the ledger,
 * and the engine. Structural fields (working/waiting/action/…) pass through untouched. */
function sanitizeActivityPayload(payload: any): any {
  if (!payload || typeof payload !== "object") return {};
  const out: any = { ...payload };
  if ("tokens" in out) out.tokens = safeCount(out.tokens);
  if (out.appraisal && typeof out.appraisal === "object") {
    out.appraisal = {
      ...out.appraisal,
      ...("fill" in out.appraisal ? { fill: safeCount(out.appraisal.fill) } : {}),
      ...("quality" in out.appraisal ? { quality: safeCount(out.appraisal.quality) } : {}),
    };
  }
  return out;
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
    // Defensive: coerce the numeric fields BEFORE they reach the rate check, the ledger, or the
    // engine, so a malformed/hostile client can't write NaN/negative into authoritative totals.
    const payload = isActivity ? sanitizeActivityPayload(args.payload) : args.payload;

    // 2. Reject/flag activity events past human + Claude rate ceilings.
    const tokens = isActivity ? safeCount(payload?.tokens) : 0;
    let activitiesInLastMinute = 0;
    if (isActivity) {
      // Bounded scan: only events from the last minute (not the whole ledger).
      const oneMinuteAgo = now - 60_000;
      const recent = await ctx.db
        .query("eventLedger")
        .withIndex("by_account_at", (q) => q.eq("accountId", account._id).gt("at", oneMinuteAgo))
        .collect();
      activitiesInLastMinute = recent.filter((e) => e.type === "activity").length;
    }
    const violation = isActivity
      ? rateViolation({ activitiesInLastMinute, tokens })
      : null;
    const accepted = violation === null;

    // 3. Append to the append-only ledger (server-stamped `at`).
    await ctx.db.insert("eventLedger", {
      accountId: account._id,
      type: args.type,
      sessionId: args.sessionId,
      source: args.source,
      payload,
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

    if (!petRow && !isActivity) {
      // Wake-only: a `register` (SessionStart / opening a session) must NOT spawn a pet —
      // pets are born from real work, so the first `activity` event spawns them. This stops
      // bare session-opens, and pre-sign-in sessions replayed from the durable outbox, from
      // populating the menagerie with phantom pets. The register stays in the ledger for audit.
      return { deduped: false, accepted: true, spawned: false };
    }

    if (!petRow) {
      // Names must be unique within an account's menagerie, so collect the ones already in
      // use and let spawnFields avoid them.
      const existing = await ctx.db
        .query("entities")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();
      const takenNames = new Set(existing.map((e) => e.name));
      const { species, name } = spawnFields(args.sessionId, takenNames);
      const entityId = crypto.randomUUID();
      const fresh = newEntity({ id: entityId, sessionId: args.sessionId, name, species, now });
      const petId = await ctx.db.insert("entities", {
        accountId: account._id,
        entityId,
        sessionId: args.sessionId,
        species: fresh.species,
        name: fresh.name,
        resources: fresh.resources,
        mode: fresh.mode,
        lastUpdated: fresh.lastUpdated,
        working: fresh.working,
        waiting: fresh.waiting,
        action: fresh.action,
        failed: fresh.failed,
        stats: newStats(),
        lifetimeTokens: 0,
        cachedStatus: "lively",
        cachedActivity: "active",
        cachedAlive: true,
      });
      petRow = (await ctx.db.get(petId))!;
    }

    // 5. Reduce: decay to `now` THEN apply the event (engine does both), write derived state.
    const engineEntity = rowToEntity(petRow);
    const event = toEngineEvent(args.type, args.sessionId, payload, now, args.clientEventId);

    // Snapshot the session's PREVIOUS state before the patch — the daily active-time
    // integral books the gap since the last event into the bucket the session was then in.
    const prevWorking = petRow.working ?? false;
    const prevAction = petRow.action ?? "none";
    const gapMs = now - petRow.lastUpdated;

    const reduced = apply({ entity: engineEntity, stats: petRow.stats }, event);
    const live = decay(reduced.entity, now);

    // Per-pet effort split — book this turn's gap into the same six buckets as the daily rollup,
    // so each session carries its own tool-mix profile (numeric only; no content).
    const petActionMs = petRow.actionMs ?? newActionMs();
    if (isActivity) {
      const span = effortSpan(prevWorking, prevAction, gapMs);
      petActionMs[span.bucket] += span.ms;
    }

    await ctx.db.patch(petRow._id, {
      resources: reduced.entity.resources,
      lastUpdated: reduced.entity.lastUpdated,
      working: reduced.entity.working,
      waiting: reduced.entity.waiting,
      action: reduced.entity.action,
      failed: reduced.entity.failed,
      stats: reduced.stats,
      lifetimeTokens: reduced.stats.tokensFed,
      actionMs: petActionMs,
      cachedStatus: live.status,
      cachedActivity: live.activity,
      cachedAlive: live.alive,
    });

    // NOTE: no account-doc write here. The account-level aggregate is derived by summing
    // per-pet stats at read time (getPlayerState) — writing the shared account row on
    // every event would create write contention (OCC conflicts) across many simultaneous
    // sessions. Per-pet rows are independent, so concurrent agents never contend.

    // Fold this turn into the account's per-(UTC day) rollup — the dashboard's spine. Only
    // activity events carry usage; per-day-row granularity keeps contention low (one account's
    // concurrent sessions share only today's row; different accounts never contend).
    if (isActivity) {
      await upsertRollups(ctx, account._id, now, {
        tokens,
        appraisal: args.payload?.appraisal,
        prevWorking,
        prevAction,
        gapMs,
      });
    }

    return { deduped: false, accepted: true, status: live.status, activity: live.activity };
  },
});

export const killPet = mutation({
  args: {
    /** The Claude Code session/pet to collapse. Ownership is checked from auth. */
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ensureAccount(ctx);
    const now = Date.now();

    const petRow = await ctx.db
      .query("entities")
      .withIndex("by_account_session", (q) =>
        q.eq("accountId", account._id).eq("sessionId", args.sessionId),
      )
      .first();
    if (!petRow) return { killed: false };

    const clientEventId = crypto.randomUUID();
    const payload = { ended: true };

    await ctx.db.insert("eventLedger", {
      accountId: account._id,
      type: "activity",
      sessionId: args.sessionId,
      source: "app",
      payload,
      at: now,
      clientEventId,
      accepted: true,
    });

    const engineEntity = rowToEntity(petRow);
    const prevWorking = petRow.working ?? false;
    const prevAction = petRow.action ?? "none";
    const gapMs = now - petRow.lastUpdated;
    const event = toEngineEvent("activity", args.sessionId, payload, now, clientEventId);
    const reduced = apply({ entity: engineEntity, stats: petRow.stats }, event);
    const live = decay(reduced.entity, now);

    await ctx.db.patch(petRow._id, {
      resources: reduced.entity.resources,
      lastUpdated: reduced.entity.lastUpdated,
      working: reduced.entity.working,
      waiting: reduced.entity.waiting,
      action: reduced.entity.action,
      failed: reduced.entity.failed,
      stats: reduced.stats,
      lifetimeTokens: reduced.stats.tokensFed,
      cachedStatus: live.status,
      cachedActivity: live.activity,
      cachedAlive: live.alive,
    });

    await upsertRollups(ctx, account._id, now, {
      tokens: 0,
      prevWorking,
      prevAction,
      gapMs,
    });

    return { killed: true, status: live.status, activity: live.activity };
  },
});

export const getPlayerState = query({
  args: {},
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) return null; // unauthenticated or not yet created

    const now = Date.now();

    // Bound the hot read to pets that could still be VISIBLE. Anything whose lastUpdated is
    // older than the worst-case lifespan (full-energy → drain → grace) is already `gone`, so
    // loading it would only be to drop it. This keeps the read O(live pets), not O(every pet
    // the account ever ran). Infinity (decay disabled) ⇒ fall back to the full scan.
    const lifespan = maxLifespanMs();
    const rows = Number.isFinite(lifespan)
      ? await ctx.db
          .query("entities")
          .withIndex("by_account_lastUpdated", (q) =>
            q.eq("accountId", account._id).gt("lastUpdated", now - lifespan),
          )
          .collect()
      : await ctx.db
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
      // Defensive: the lifespan bound is an UPPER bound (assumes full energy), so a few rows
      // in-window may already be terminal. Drop them from the live menagerie.
      .filter((p) => !p.liveness.gone)
      .sort((a, b) => b.updatedAt - a.updatedAt); // most recently active first

    // Account aggregate comes from the per-(UTC day) rollup, NOT the live pets — the rollup is
    // COMPLETE (it survives pet despawn, backfilled from the ledger) and bounded (~a year of
    // sparse rows), so the total is monotonic and the read no longer scales with pet count.
    // survival/zone are server-derived stubs (always 0 today); carried through as 0.
    const dailyRows = await ctx.db
      .query("dailyStats")
      .withIndex("by_account_day", (q) => q.eq("accountId", account._id))
      .take(400);
    const life = sumDailies(
      dailyRows.map((r) => ({
        tokensFed: r.tokensFed,
        activeMs: r.activeMs,
        actionMs: r.actionMs,
        promptQualitySum: r.promptQualitySum,
        promptCount: r.promptCount,
      })),
    );
    const aggStats = {
      tokensFed: life.tokensFed,
      promptQualitySum: life.promptQualitySum,
      promptCount: life.promptCount,
      survivalStreakDays: 0,
      zoneAchievements: 0,
    };
    const aggregate = toTrainerStats(aggStats);

    return {
      account: {
        githubLogin: account.githubLogin ?? null,
        // The client gates on this: a signed-in account with no username sees the mandatory
        // "choose your handle" screen before anything else.
        username: account.username ?? null,
        visibility: account.visibility,
        verified: account.verified,
        gear: account.gear ?? null,
      },
      pets,
      stats: aggStats,
      trainerStats: aggregate,
      score: score(aggregate),
      updatedAt: now,
    };
  },
});
