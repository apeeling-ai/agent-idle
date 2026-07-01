/**
 * Friends — usernames, friend requests, and the friends-only leaderboard.
 *
 * Identity is the player's globally-unique `username` (see schema). It's set once after first
 * login (the app gates on it) and doubles as the display name everywhere, retiring "anonymous".
 *
 * Friendship is MUTUAL: `sendFriendRequest` creates a `pending` edge; the recipient accepts to
 * flip it to `accepted`. Because both sides consented, the friends leaderboard shows each
 * friend's score regardless of their global public/private `visibility` — only the same numeric
 * tokens + handle the global board already exposes ever cross this boundary (privacy stays
 * structural: no prompt/code text exists to leak).
 *
 * SCALE: every read here is an indexed `.take()` with an explicit cap — never `.collect()` and
 * never a table scan. Friendships are individual rows (not an array on the account), so a player
 * with many friends is many small rows, not one document that rewrites on every change. The
 * friends leaderboard does N bounded point-reads (one stat row per friend), which is the right
 * shape for friend-sized N; `FRIEND_CAP` bounds the worst case.
 */

import { seasonIndexOf, seasonStartDay, decorationForSeason, utcDayOf, TIME } from "@agent-idle/engine";
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { currentAccount, displayName, ensureAccount } from "./lib/auth";

/** Hard ceilings so every read stays bounded as the graph grows. A friend list far past this is
 * not a real social graph for this product; the cap protects the query, not the user. */
const FRIEND_CAP = 200;
const REQUEST_CAP = 200;

// ── Username validation ────────────────────────────────────────────────────────────────────

/** Built once per isolate. The English preset + recommended transformers catch common obfuscation
 * (leetspeak like `f4ck`, simple separators) without the false positives of a naive substring list. */
const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** Handles people should never be able to mint, regardless of profanity. */
const RESERVED = new Set([
  "admin", "administrator", "moderator", "mod", "support", "staff", "help",
  "root", "system", "official", "agentidle", "agent_idle", "anonymous", "you",
  "null", "undefined", "everyone", "team",
]);

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/** Normalize to the stored form: trimmed + lowercased. The display capitalization is not preserved
 * (the handle is canonical), keeping uniqueness checks case-insensitive by construction. */
function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A friendly, user-facing reason the handle is rejected, or null if it's allowed. Pure (no IO),
 * so it's unit-testable and reused by the client for live validation if desired. */
export function usernameError(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < 3) return "Username must be at least 3 characters.";
  if (name.length > 20) return "Username must be at most 20 characters.";
  if (!USERNAME_RE.test(name)) return "Use only letters, numbers, and underscores.";
  if (RESERVED.has(name)) return "That username is reserved.";
  // Check the handle and a separator-stripped form, so `f_u_c_k` can't slip past on underscores.
  if (profanityMatcher.hasMatch(name) || profanityMatcher.hasMatch(name.replace(/_/g, ""))) {
    return "That username isn't allowed.";
  }
  return null;
}

// ── Shared read helpers ──────────────────────────────────────────────────────────────────────

/** The account ids the caller is ACCEPTED friends with (either direction), deduped + capped. */
async function friendIdsOf(ctx: QueryCtx, me: Id<"accounts">): Promise<Id<"accounts">[]> {
  const asFrom = await ctx.db
    .query("friendEdges")
    .withIndex("by_from_status", (q) => q.eq("from", me).eq("status", "accepted"))
    .take(FRIEND_CAP);
  const asTo = await ctx.db
    .query("friendEdges")
    .withIndex("by_to_status", (q) => q.eq("to", me).eq("status", "accepted"))
    .take(FRIEND_CAP);

  const ids = new Set<string>();
  const out: Id<"accounts">[] = [];
  for (const e of asFrom) if (!ids.has(e.to)) (ids.add(e.to), out.push(e.to));
  for (const e of asTo) if (!ids.has(e.from)) (ids.add(e.from), out.push(e.from));
  return out.slice(0, FRIEND_CAP);
}

// ── Mutations ──────────────────────────────────────────────────────────────────────────────

/**
 * Claim (or change) the caller's username. Validated server-side (format → reserved → profanity →
 * uniqueness); the server is authoritative, so the client's live validation is only a convenience.
 * Returns `{ ok, error? }` for expected failures (no thrown stack traces for "taken"/"invalid").
 */
export const setUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string; username?: string }> => {
    const account = await ensureAccount(ctx);
    const name = normalizeUsername(args.username);

    const invalid = usernameError(name);
    if (invalid) return { ok: false, error: invalid };

    if (account.username === name) return { ok: true, username: name }; // no-op re-claim

    // Uniqueness: Convex has no unique constraint, so check the index first. (Two racing claims of
    // the same free name is a vanishingly rare, low-stakes collision for a username pick.)
    const taken = await ctx.db
      .query("accounts")
      .withIndex("by_username", (q) => q.eq("username", name))
      .first();
    if (taken && taken._id !== account._id) return { ok: false, error: "That username is taken." };

    await ctx.db.patch(account._id, { username: name });
    return { ok: true, username: name };
  },
});

/**
 * Set the caller's GLOBAL leaderboard visibility. `"public"` lists you on the global daily/season
 * boards by handle + score; `"private"` (the account default, see lib/auth.ts) hides you from
 * everyone but yourself. Mutual friends see you on the friends board regardless, via consent. Only
 * the same numeric tokens + handle the board already exposes is ever affected — privacy stays
 * structural (no prompt/code text exists to leak). Idempotent. The board reads visibility live off
 * the account doc (stats.ts), so a toggle takes effect on the next leaderboard read.
 */
export const setVisibility = mutation({
  args: { visibility: v.union(v.literal("public"), v.literal("private")) },
  handler: async (ctx, args): Promise<{ ok: boolean; visibility: "public" | "private" }> => {
    const account = await ensureAccount(ctx);
    if (account.visibility !== args.visibility) {
      await ctx.db.patch(account._id, { visibility: args.visibility });
    }
    return { ok: true, visibility: args.visibility };
  },
});

/**
 * Send a friend request by username. Idempotent and symmetric: if the target has already requested
 * the caller, this AUTO-ACCEPTS instead of stacking a second edge. Returns a status string the UI
 * turns into a message; expected failures come back as `{ ok: false, error }`.
 */
export const sendFriendRequest = mutation({
  args: { username: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error?: string; status?: "requested" | "accepted" | "pending" | "already_friends" }> => {
    const me = await ensureAccount(ctx);
    if (!me.username) return { ok: false, error: "Set your username before adding friends." };

    const name = normalizeUsername(args.username);
    const target = await ctx.db
      .query("accounts")
      .withIndex("by_username", (q) => q.eq("username", name))
      .first();
    if (!target) return { ok: false, error: `No player found with the username “${name}”.` };
    if (target._id === me._id) return { ok: false, error: "You can't add yourself." };

    // They already asked me → accept their pending edge rather than creating a mirror.
    const reverse = await ctx.db
      .query("friendEdges")
      .withIndex("by_from_to", (q) => q.eq("from", target._id).eq("to", me._id))
      .first();
    if (reverse) {
      if (reverse.status === "accepted") return { ok: true, status: "already_friends" };
      await ctx.db.patch(reverse._id, { status: "accepted" });
      return { ok: true, status: "accepted" };
    }

    const forward = await ctx.db
      .query("friendEdges")
      .withIndex("by_from_to", (q) => q.eq("from", me._id).eq("to", target._id))
      .first();
    if (forward) {
      return { ok: true, status: forward.status === "accepted" ? "already_friends" : "pending" };
    }

    await ctx.db.insert("friendEdges", {
      from: me._id,
      to: target._id,
      status: "pending",
      createdAt: Date.now(),
    });
    return { ok: true, status: "requested" };
  },
});

/** Accept an incoming request. Only the recipient (`edge.to`) can accept; otherwise a no-op. */
export const acceptFriendRequest = mutation({
  args: { requestId: v.id("friendEdges") },
  handler: async (ctx, args) => {
    const me = await ensureAccount(ctx);
    const edge = await ctx.db.get(args.requestId);
    if (!edge || edge.to !== me._id || edge.status !== "pending") return { ok: false };
    await ctx.db.patch(edge._id, { status: "accepted" });
    return { ok: true };
  },
});

/** Decline an incoming request — the recipient deletes the pending edge. */
export const declineFriendRequest = mutation({
  args: { requestId: v.id("friendEdges") },
  handler: async (ctx, args) => {
    const me = await ensureAccount(ctx);
    const edge = await ctx.db.get(args.requestId);
    if (!edge || edge.to !== me._id || edge.status !== "pending") return { ok: false };
    await ctx.db.delete(edge._id);
    return { ok: true };
  },
});

/** Cancel an outgoing request — the requester deletes their own pending edge. */
export const cancelFriendRequest = mutation({
  args: { requestId: v.id("friendEdges") },
  handler: async (ctx, args) => {
    const me = await ensureAccount(ctx);
    const edge = await ctx.db.get(args.requestId);
    if (!edge || edge.from !== me._id || edge.status !== "pending") return { ok: false };
    await ctx.db.delete(edge._id);
    return { ok: true };
  },
});

/** Remove an accepted friend — deletes the edge in whichever direction it was created. */
export const removeFriend = mutation({
  args: { friendAccountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const me = await ensureAccount(ctx);
    for (const [a, b] of [
      [me._id, args.friendAccountId],
      [args.friendAccountId, me._id],
    ] as const) {
      const edge = await ctx.db
        .query("friendEdges")
        .withIndex("by_from_to", (q) => q.eq("from", a).eq("to", b))
        .first();
      if (edge) await ctx.db.delete(edge._id);
    }
    return { ok: true };
  },
});

// ── Queries ──────────────────────────────────────────────────────────────────────────────────

const EMPTY_OVERVIEW = { myUsername: null, friends: [], incoming: [], outgoing: [] };

/**
 * Everything the Friends tab needs in one round trip: the caller's handle, their accepted friends,
 * and pending requests in both directions. All reads are indexed `.take()`s capped at REQUEST_CAP /
 * FRIEND_CAP.
 */
export const getFriendsOverview = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentAccount(ctx);
    if (!me) return EMPTY_OVERVIEW;

    const friendIds = await friendIdsOf(ctx, me._id);
    const friends: { accountId: Id<"accounts">; name: string }[] = [];
    for (const id of friendIds) {
      const acct = await ctx.db.get(id);
      if (acct) friends.push({ accountId: id, name: displayName(acct) });
    }
    friends.sort((a, b) => a.name.localeCompare(b.name));

    const incomingEdges = await ctx.db
      .query("friendEdges")
      .withIndex("by_to_status", (q) => q.eq("to", me._id).eq("status", "pending"))
      .take(REQUEST_CAP);
    const incoming: { requestId: Id<"friendEdges">; name: string }[] = [];
    for (const e of incomingEdges) {
      const acct = await ctx.db.get(e.from);
      if (acct) incoming.push({ requestId: e._id, name: displayName(acct) });
    }

    const outgoingEdges = await ctx.db
      .query("friendEdges")
      .withIndex("by_from_status", (q) => q.eq("from", me._id).eq("status", "pending"))
      .take(REQUEST_CAP);
    const outgoing: { requestId: Id<"friendEdges">; name: string }[] = [];
    for (const e of outgoingEdges) {
      const acct = await ctx.db.get(e.to);
      if (acct) outgoing.push({ requestId: e._id, name: displayName(acct) });
    }

    return { myUsername: me.username ?? null, friends, incoming, outgoing };
  },
});

type Entry = { name: string; tokens: number; isYou: boolean };

/** Build one scope's friend board from a set of accounts + their stat rows, sorted by score desc.
 * Friends with no row in the window are still listed (at 0), so the board shows your whole circle. */
function rankFriends(
  rows: { name: string; tokens: number; score: number; isYou: boolean }[],
): Entry[] {
  return rows
    .sort((a, b) => b.score - a.score || b.tokens - a.tokens)
    .map(({ name, tokens, isYou }) => ({ name, tokens, isYou }));
}

/**
 * The friends-only leaderboard for BOTH scopes (today + this season) in one read — shaped exactly
 * like the public boards so the existing <Leaderboard> renders it unchanged. Bypasses public/private
 * visibility (mutual consent). The caller is always included. N bounded point-reads (≤ FRIEND_CAP+1).
 */
export const getFriendsLeaderboard = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentAccount(ctx);
    const now = Date.now();
    const today = utcDayOf(now);
    const season = seasonIndexOf(today);
    const seasonEndsAt = seasonStartDay(season + 1) * TIME.DAY_MS;
    const prize = decorationForSeason(season);
    const reward = { kind: prize.kind, glyph: prize.glyph, label: prize.label };
    const emptySeason = { entries: [], you: null, season, seasonEndsAt, reward };

    if (!me) return { today: { entries: [], you: null, utcDay: today }, season: emptySeason };

    const ids = [me._id, ...(await friendIdsOf(ctx, me._id))];

    const todayRows: { name: string; tokens: number; score: number; isYou: boolean }[] = [];
    const seasonRows: { name: string; tokens: number; score: number; isYou: boolean }[] = [];
    for (const id of ids) {
      const acct = await ctx.db.get(id);
      if (!acct) continue;
      const name = displayName(acct);
      const isYou = id === me._id;

      const dayRow = await ctx.db
        .query("dailyStats")
        .withIndex("by_account_day", (q) => q.eq("accountId", id).eq("utcDay", today))
        .unique();
      todayRows.push({
        name,
        tokens: dayRow?.tokensFed ?? 0,
        score: dayRow?.cachedDailyScore ?? 0,
        isYou,
      });

      const seasonRow = await ctx.db
        .query("seasonStats")
        .withIndex("by_account_season", (q) => q.eq("accountId", id).eq("season", season))
        .unique();
      seasonRows.push({
        name,
        tokens: seasonRow?.tokensFed ?? 0,
        score: seasonRow?.cachedSeasonScore ?? 0,
        isYou,
      });
    }

    return {
      today: { entries: rankFriends(todayRows), you: null, utcDay: today },
      season: { entries: rankFriends(seasonRows), you: null, season, seasonEndsAt, reward },
    };
  },
});
