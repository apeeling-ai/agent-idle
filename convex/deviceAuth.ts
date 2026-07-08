import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { ensureAccount } from "./lib/auth";

const CODE_TTL_MS = 10 * 60_000;

export const create = mutation({
  args: {
    deviceId: v.string(),
    userCode: v.string(),
    publicKeyJwk: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("deviceAuthCodes", {
      deviceId: args.deviceId,
      userCode: args.userCode,
      publicKeyJwk: args.publicKeyJwk,
      createdAt: now,
      expiresAt: now + CODE_TTL_MS,
    });
    return { expiresAt: now + CODE_TTL_MS, publicKeyJwk: args.publicKeyJwk };
  },
});

export const approve = mutation({
  args: {
    userCode: v.string(),
    encryptedToken: v.object({
      encryptedKey: v.string(),
      iv: v.string(),
      ciphertext: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const account = await ensureAccount(ctx);
    const now = Date.now();
    const pending = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_userCode", (q) => q.eq("userCode", args.userCode))
      .order("desc")
      .first();

    if (!pending || pending.expiresAt < now || pending.consumedAt || pending.approvedAt) {
      return { ok: false, reason: "expired" };
    }

    await ctx.db.patch(pending._id, {
      approvedAt: now,
      accountId: account._id,
      encryptedToken: args.encryptedToken,
    });
    return { ok: true };
  },
});

export const getPublicKey = mutation({
  args: {
    userCode: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_userCode", (q) => q.eq("userCode", args.userCode))
      .order("desc")
      .first();

    if (!pending || pending.expiresAt < now || pending.consumedAt || pending.approvedAt) {
      return { ok: false as const };
    }
    return { ok: true as const, publicKeyJwk: pending.publicKeyJwk };
  },
});

export const poll = mutation({
  args: {
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const code = await ctx.db
      .query("deviceAuthCodes")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();

    if (!code) return { status: "not_found" as const };
    if (code.expiresAt < now) return { status: "expired" as const };
    if (code.consumedAt) return { status: "consumed" as const };
    if (!code.encryptedToken) return { status: "pending" as const };

    await ctx.db.patch(code._id, { consumedAt: now, encryptedToken: undefined });
    return { status: "approved" as const, encryptedToken: code.encryptedToken };
  },
});
