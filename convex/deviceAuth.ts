/**
 * CLI/app device-authorization grant (RFC-8628-style), built on Convex Auth.
 *
 * The machine never runs an in-app OAuth redirect and never receives a token through the browser.
 * Instead:
 *   1. the machine registers a code — a secret `deviceId` (kept locally) + a human-visible
 *      `userCode` (put in the browser URL);
 *   2. the signed-in browser calls `approve({ userCode })` — a plain authenticated mutation that
 *      stamps the approving user. It mints and deletes NOTHING, so the browser keeps its own
 *      session (this is what "shares the normal sign-in" means);
 *   3. the machine polls `status({ deviceId })`, then completes its OWN sign-in through the
 *      `device` ConvexCredentials provider (see convex/auth.ts) by presenting `deviceId`. Convex
 *      Auth mints the machine its own session and hands the tokens straight back to the machine.
 *
 * `deviceId` is the secret bearer (122-bit UUID, never sent to the browser); `userCode` is the
 * public approval code. `redeemDeviceCode` is the single-use redemption the credentials provider
 * calls; it is internal so only the auth flow can consume a code.
 */
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

const CODE_TTL_MS = 10 * 60_000;

export const create = mutation({
  args: {
    deviceId: v.string(),
    userCode: v.string(),
  },
  returns: v.object({ expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + CODE_TTL_MS;
    await ctx.db.insert("deviceAuthCodes", {
      deviceId: args.deviceId,
      userCode: args.userCode,
      createdAt: now,
      expiresAt,
    });
    return { expiresAt };
  },
});

export const approve = mutation({
  args: { userCode: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    // Just records WHO approved — no session mint, no deletion, so the browser's own session is
    // left completely intact. Authenticated: the approver is the currently signed-in user.
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false };
    const now = Date.now();
    const pending = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_userCode", (q) => q.eq("userCode", args.userCode))
      .order("desc")
      .first();
    if (!pending || pending.expiresAt < now || pending.consumedAt) {
      return { ok: false };
    }
    // Idempotent: a re-render / refresh re-approving an already-approved code is a success, not
    // an "expired or invalid" failure — the machine is already free to redeem it.
    if (pending.approvedAt) {
      return { ok: pending.approvedByUserId === userId };
    }
    await ctx.db.patch(pending._id, { approvedAt: now, approvedByUserId: userId });
    return { ok: true };
  },
});

export const status = mutation({
  args: { deviceId: v.string() },
  returns: v.object({
    status: v.union(
      v.literal("not_found"),
      v.literal("expired"),
      v.literal("consumed"),
      v.literal("pending"),
      v.literal("approved"),
    ),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();
    if (!code) return { status: "not_found" as const };
    if (code.consumedAt) return { status: "consumed" as const };
    if (code.expiresAt < now) return { status: "expired" as const };
    if (!code.approvedByUserId) return { status: "pending" as const };
    return { status: "approved" as const };
  },
});

/**
 * Single-use redemption for the `device` credentials provider. Verifies the secret `deviceId`,
 * that the code is approved and still valid, marks it consumed (so it can't be replayed), and
 * returns the approving user's id. Internal — only convex/auth.ts's provider may call it.
 */
export const redeemDeviceCode = internalMutation({
  args: { deviceId: v.string() },
  returns: v.union(v.object({ userId: v.id("users") }), v.null()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();
    if (!code || code.consumedAt || code.expiresAt < now || !code.approvedByUserId) {
      return null;
    }
    await ctx.db.patch(code._id, { consumedAt: now });
    return { userId: code.approvedByUserId };
  },
});

/**
 * Delete expired device codes. Runs on a cron (see convex/crons.ts) — this table only ever holds
 * transient 10-min codes, so it should stay near-empty. Keeping it clean also means a future
 * schema change to it isn't tripped up by stale rows (see the widen→migrate→narrow note in
 * CLAUDE.md). Bounded per run; the cron reschedules, so a backlog drains over a few ticks.
 */
export const purgeExpiredDeviceCodes = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const page = await ctx.db.query("deviceAuthCodes").take(1000);
    let deleted = 0;
    for (const code of page) {
      if (code.expiresAt < now) {
        await ctx.db.delete(code._id);
        deleted++;
      }
    }
    return { deleted };
  },
});
