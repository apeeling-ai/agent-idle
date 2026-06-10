/**
 * OPTIONAL maintenance. There is NO per-entity tick — liveness is derived via
 * engine.decay at every read/reduce. This sweep exists ONLY for side effects that
 * need to fire when nobody is watching (death notifications, hard leaderboard
 * purge). It is a cheap, low-frequency batch over ONLY stale rows — not the tick.
 *
 * STUB and OFF by default (see crons.ts).
 */

import {
  type ActionMs,
  type DailyRollup,
  type PetAction,
  dailyScore,
  decay,
  effortSpan,
  foldActivity,
  newActionMs,
  newDailyRollup,
  utcDayOf,
} from "@agent-idle/engine";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { rowToEntity } from "./lib/entity";
import { dailyLeaderboard, resetLeaderboardAggregate } from "./lib/leaderboard";
import { pickName } from "./lib/spawn";

/**
 * Rebuild the dailyStats rollup from scratch by replaying the append-only eventLedger — the
 * TRUE source. Idempotent: wipes existing rows then folds every accepted activity event back
 * in with the same engine math the live path uses (per-session gap → active-time integral),
 * so dailyStats becomes historically COMPLETE (no despawned-pet loss) and the heatmap/streaks
 * gain their real history. Safe to run any time; the live ingest keeps it current afterward.
 */
export const backfillDailyStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const r of await ctx.db.query("dailyStats").collect()) await ctx.db.delete(r._id);

    const events = (await ctx.db.query("eventLedger").collect())
      .filter((e) => e.type === "activity" && e.accepted)
      .sort((a, b) => a.at - b.at);

    // Per (account, UTC day) rollup, per-pet effort split, and per session the previous event.
    const rollups = new Map<string, { accountId: Id<"accounts">; utcDay: number; r: DailyRollup }>();
    const petEffort = new Map<string, { accountId: Id<"accounts">; sessionId: string; a: ActionMs }>();
    const sessionPrev = new Map<string, { at: number; working: boolean; action: PetAction }>();

    for (const e of events) {
      const sessKey = `${e.accountId}|${e.sessionId}`;
      const prev = sessionPrev.get(sessKey);
      const utcDay = utcDayOf(e.at);
      const dayKey = `${e.accountId}|${utcDay}`;
      const cur = rollups.get(dayKey) ?? { accountId: e.accountId, utcDay, r: newDailyRollup() };
      cur.r = foldActivity(cur.r, {
        tokens: (e.payload?.tokens as number | undefined) ?? 0,
        appraisal: e.payload?.appraisal,
        prevWorking: prev?.working ?? false,
        prevAction: prev?.action ?? "none",
        gapMs: prev ? e.at - prev.at : 0,
      });
      rollups.set(dayKey, cur);

      // Per-pet effort: same span, booked to this session's own tool-mix.
      const span = effortSpan(prev?.working ?? false, prev?.action ?? "none", prev ? e.at - prev.at : 0);
      const pe = petEffort.get(sessKey) ?? { accountId: e.accountId, sessionId: e.sessionId, a: newActionMs() };
      pe.a[span.bucket] += span.ms;
      petEffort.set(sessKey, pe);

      // Mirror apply(): an `ended`/faint turn resets working to false for the next gap.
      const working = e.payload?.ended ? false : ((e.payload?.working as boolean | undefined) ?? false);
      sessionPrev.set(sessKey, { at: e.at, working, action: (e.payload?.action as PetAction) ?? "none" });
    }

    let inserted = 0;
    for (const { accountId, utcDay, r } of rollups.values()) {
      await ctx.db.insert("dailyStats", { accountId, utcDay, ...r, cachedDailyScore: dailyScore(r) });
      inserted++;
    }

    // Patch each pet with its reconstructed effort split.
    let petsPatched = 0;
    for (const { accountId, sessionId, a } of petEffort.values()) {
      const pet = await ctx.db
        .query("entities")
        .withIndex("by_account_session", (q) => q.eq("accountId", accountId).eq("sessionId", sessionId))
        .first();
      if (pet) {
        await ctx.db.patch(pet._id, { actionMs: a });
        petsPatched++;
      }
    }

    // The dailyStats rows were all replaced — rebuild the leaderboard aggregate to match.
    await resetLeaderboardAggregate(ctx);
    return { inserted, eventsReplayed: events.length, petsPatched };
  },
});

/**
 * One-shot: populate the daily-leaderboard aggregate from the existing dailyStats table (clear +
 * re-insert). Run once after attaching the aggregate so historical days have correct rank/count;
 * the live ingest keeps it current afterward. Idempotent.
 */
export const backfillLeaderboardAggregate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const synced = await resetLeaderboardAggregate(ctx);
    return { synced };
  },
});

/**
 * Dev audit: compare the THREE possible "lifetime tokens" totals so we can see whether the
 * dashboard figure is complete. eventLedger is the true append-only source; the entities sum
 * loses despawned pets; dailyStats is the per-account rollup (correct going forward).
 */
export const tokenAudit = internalQuery({
  args: {},
  handler: async (ctx) => {
    const entities = await ctx.db.query("entities").collect();
    const ledger = await ctx.db.query("eventLedger").collect();
    const daily = await ctx.db.query("dailyStats").collect();

    const entitiesAll = entities.reduce((s, e) => s + (e.stats?.tokensFed ?? 0), 0);
    const ledgerTokens = ledger
      .filter((e) => e.type === "activity" && e.accepted)
      .reduce((s, e) => s + ((e.payload?.tokens as number | undefined) ?? 0), 0);
    const dailyTokens = daily.reduce((s, d) => s + d.tokensFed, 0);

    return {
      entitiesSum: entitiesAll, // what the dashboard "Lifetime tokens" currently shows
      ledgerSum: ledgerTokens, // TRUE lifetime (append-only, never loses despawned pets)
      dailySum: dailyTokens, // rollup sum (correct going forward; was wiped earlier)
      counts: { entities: entities.length, ledgerActivity: ledger.length, dailyRows: daily.length },
    };
  },
});

/**
 * One-shot data migration: strip dead fields from existing `accounts` rows so they match the
 * current validator. `seasonStats` / `lifetimeStats` (the abandoned account-stats lineage) and
 * `loadout` (superseded by `gear`) were removed from the schema; `replace` rewrites each row with
 * ONLY the valid fields, dropping anything else. Run once, then schema validation passes clean.
 */
export const stripDeadAccountFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("accounts").collect();
    let cleaned = 0;
    for (const a of accounts) {
      await ctx.db.replace(a._id, {
        authSubject: a.authSubject,
        ...(a.githubLogin !== undefined ? { githubLogin: a.githubLogin } : {}),
        visibility: a.visibility,
        verified: a.verified,
        ...(a.gear !== undefined ? { gear: a.gear } : {}),
      });
      cleaned++;
    }
    return { cleaned };
  },
});

/**
 * One-shot data migration: strip dead fields from existing `entities` rows so they match the
 * current validator. `cosmetics` (per-pet cosmetic system, removed — gear is account-level) and
 * `workingUntil` (deprecated, superseded by `working`) were dropped from the schema. Deletes just
 * those keys and rewrites the row (keeping every still-valid field). Run once, then validation passes.
 */
export const stripDeadEntityFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("entities").collect();
    let cleaned = 0;
    for (const row of rows) {
      const rec = { ...(row as Record<string, unknown>) };
      if (!("cosmetics" in rec) && !("workingUntil" in rec)) continue;
      delete rec._id;
      delete rec._creationTime;
      delete rec.cosmetics;
      delete rec.workingUntil;
      // biome-ignore lint/suspicious/noExplicitAny: one-shot migration over loosely-typed rows.
      await ctx.db.replace(row._id, rec as any);
      cleaned++;
    }
    return { cleaned };
  },
});

/**
 * One-shot backfill: populate the denormalized top-level `lifetimeTokens` (= stats.tokensFed) on
 * existing `entities` rows so the new by_account_tokens index ranks them correctly. New/updated
 * rows set it on every reduce; this catches everything that predates the field. Idempotent.
 */
export const backfillEntityTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("entities").collect();
    let patched = 0;
    for (const row of rows) {
      if (row.lifetimeTokens === row.stats.tokensFed) continue;
      await ctx.db.patch(row._id, { lifetimeTokens: row.stats.tokensFed });
      patched++;
    }
    return { patched };
  },
});

/**
 * One-shot cleanup: rename pets whose names carry an ugly numeric suffix ("Pebble 2") — left over
 * from the old small name pool — to fresh, nice, account-unique names via the current generator
 * (single noun → adjective+noun). Per account, the non-ugly names are reserved first so renames
 * never collide with a kept name or each other.
 */
export const renameUglyPets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("entities").collect();
    const byAccount = new Map<Id<"accounts">, Doc<"entities">[]>();
    for (const row of rows) {
      const arr = byAccount.get(row.accountId) ?? [];
      arr.push(row);
      byAccount.set(row.accountId, arr);
    }

    const uglySuffix = / \d+$/;
    let renamed = 0;
    for (const pets of byAccount.values()) {
      const taken = new Set(pets.filter((p) => !uglySuffix.test(p.name)).map((p) => p.name));
      for (const pet of pets) {
        if (!uglySuffix.test(pet.name)) continue;
        const name = pickName(pet.sessionId, taken);
        await ctx.db.patch(pet._id, { name });
        taken.add(name);
        renamed++;
      }
    }
    return { renamed };
  },
});

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
 * Dev convenience: wipe the dailyStats rollup table. These rows are DERIVED (the server folds
 * them from the append-only eventLedger), so clearing them is safe — they rebuild as new turns
 * land. Use after a breaking change to the rollup shape (e.g. widening actionMs).
 */
export const clearDailyStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("dailyStats").collect();
    const days = new Set(rows.map((r) => r.utcDay));
    for (const row of rows) await ctx.db.delete(row._id);
    // Keep the leaderboard aggregate in lockstep with the table.
    for (const day of days) await dailyLeaderboard.clear(ctx, { namespace: day });
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
