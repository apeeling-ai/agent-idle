/**
 * Convex schema — the authoritative state. LOCAL deployment for now; the same code
 * runs identically against Convex Cloud or self-hosted-on-Postgres later (see README
 * open-decision #2).
 *
 * PRIVACY IS STRUCTURAL: there is NO prompt-text and NO source-code column anywhere
 * in this file, by design. Sensors send counts + a coarse numeric quality only.
 *
 * The server is the ONLY writer of canonical state. Clients never write totals; they
 * emit events (eventLedger) which `ingestEvent` validates and reduces with the shared
 * @agent-idle/engine. Callers are AUTHENTICATED via Convex Auth (GitHub) — the old
 * per-account HMAC secret is gone; trust comes from `ctx.auth.getUserIdentity()`.
 * Liveness (status/alive) is DERIVED via engine.decay and only persisted as a cache
 * when the server reduces.
 */

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const resources = v.object({
  energy: v.number(),
});

const stats = v.object({
  tokensFed: v.number(),
  promptQualitySum: v.number(),
  promptCount: v.number(),
  survivalStreakDays: v.number(),
  zoneAchievements: v.number(),
});

/** Per-action working-time split (ms), mirrors the engine's ActionMs. */
const actionMs = v.object({
  shell: v.number(),
  edit: v.number(),
  read: v.number(),
  web: v.number(),
  thinking: v.number(),
  idle: v.number(),
});

export default defineSchema({
  // Convex Auth-managed tables (users, authSessions, authAccounts, …).
  ...authTables,

  accounts: defineTable({
    /** The Convex Auth identity subject (users._id as string). The trust anchor. */
    authSubject: v.string(),
    /** GitHub login, when resolvable from the identity. */
    githubLogin: v.optional(v.string()),
    visibility: v.union(v.literal("private"), v.literal("public")), // default "private"
    verified: v.boolean(),
    seasonStats: stats,
    lifetimeStats: stats,
    /** Player gear LOADOUT override: per slot, the chosen rung NAME to wear (e.g. armor:"plate").
     * Absent slots fall back to the auto-highest unlocked rung. Validated on write against the
     * account's lifetime tokens (engine.canEquip), so only reached rungs can be stored. */
    loadout: v.optional(
      v.object({
        armor: v.optional(v.string()),
        weapon: v.optional(v.string()),
        helm: v.optional(v.string()),
        aura: v.optional(v.string()),
      }),
    ),
  }).index("by_authSubject", ["authSubject"]),

  // One row per Claude Code session ("pet"). A player (account) has many.
  entities: defineTable({
    accountId: v.id("accounts"),
    // `id` from the engine's Entity is mirrored here for cross-runtime stability.
    entityId: v.string(),
    // The Claude Code session this pet represents (unique per account).
    sessionId: v.string(),
    species: v.union(v.literal("knight"), v.literal("wizard"), v.literal("rogue")),
    name: v.string(),
    resources,
    cosmetics: v.object({
      owned: v.array(v.string()),
      equipped: v.array(v.string()),
    }),
    mode: v.union(v.literal("normal"), v.literal("hardcore")),
    lastUpdated: v.number(),
    // Was the session working as of its last event? The freshness window is applied at
    // read time (engine.decay), so this is just a flag. Optional → false for older rows.
    working: v.optional(v.boolean()),
    // Latest "wants the human" signal (permission/idle Notification). Freshness applied at
    // read time (engine.decay). Optional → "none" for older rows.
    waiting: v.optional(v.union(v.literal("none"), v.literal("alert"), v.literal("question"))),
    // Live tool category (shell/edit/read/web) → which room/animation the pet works in.
    // Freshness applied at read time (engine.decay). Optional → "none" for older rows.
    action: v.optional(
      v.union(
        v.literal("none"),
        v.literal("shell"),
        v.literal("edit"),
        v.literal("read"),
        v.literal("web"),
      ),
    ),
    // Knocked out after a failed turn (StopFailure). Freshness applied at read time
    // (engine.decay). Optional → false for older rows.
    failed: v.optional(v.boolean()),
    // Deprecated: superseded by `working`. Tolerated (optional) so legacy rows validate;
    // no longer written. Drop once no row carries it.
    workingUntil: v.optional(v.number()),
    // Per-pet usage totals (cosmetics + score are scoped per pet).
    stats,
    // Per-pet effort split (ms) — how THIS session spent its working time, same six buckets as
    // the daily rollup. Numeric only (tool categories, never content). Optional → legacy rows
    // read as all-zero until backfilled / their next turn.
    actionMs: v.optional(actionMs),
    // DERIVED cache only — recomputed by engine.decay at every read/reduce, never
    // client-authored. Stored so the leaderboard can sort without recomputing all.
    cachedStatus: v.optional(v.string()),
    cachedActivity: v.optional(v.string()),
    cachedAlive: v.optional(v.boolean()),
  })
    .index("by_account", ["accountId"])
    .index("by_account_session", ["accountId", "sessionId"])
    .index("by_lastUpdated", ["lastUpdated"]),

  // APPEND-ONLY. The source of truth for credibility + multi-device sync.
  eventLedger: defineTable({
    accountId: v.id("accounts"),
    type: v.union(v.literal("register"), v.literal("activity")),
    // The session this event routes to.
    sessionId: v.string(),
    source: v.string(), // e.g. "app", "cli-daemon"
    // Numeric payload only — appraisal numbers + counts. NEVER prompt text / code.
    payload: v.any(),
    at: v.number(), // SERVER-stamped authoritative time
    clientEventId: v.string(), // idempotency key
    accepted: v.boolean(),
    /** Why an event was not reduced (rate ceiling, etc.). Null when accepted. */
    rejectedReason: v.optional(v.string()),
  })
    .index("by_account", ["accountId"])
    .index("by_account_at", ["accountId", "at"]) // bounded recent-events scan (rate check)
    .index("by_clientEventId", ["clientEventId"]), // unique dedup lookup

  // One row per (account, UTC day). The server folds each accepted activity event into
  // today's row via lib/rollup.ts (engine.foldActivity), so the dashboard's Today/Season/
  // All-Time aggregates + the daily leaderboard derive from the same math as everything else.
  // `cachedDailyScore` is stored so the leaderboard can sort on an index without recomputing.
  dailyStats: defineTable({
    accountId: v.id("accounts"),
    utcDay: v.number(), // engine.utcDayOf(now) — UTC-day bucket (server-verifiable)
    tokensFed: v.number(),
    activeMs: v.number(),
    actionMs,
    promptQualitySum: v.number(),
    promptCount: v.number(),
    cachedDailyScore: v.number(),
  })
    .index("by_account_day", ["accountId", "utcDay"]) // a row's upsert + an account's history
    .index("by_day_score", ["utcDay", "cachedDailyScore"]), // today's leaderboard, ranked

  saves: defineTable({
    ownerId: v.id("accounts"),
    entities: v.array(v.string()), // entityIds owned by this account
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
});
