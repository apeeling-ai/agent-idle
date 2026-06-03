/**
 * Account bootstrap. The app calls `getOrCreateAccount` right after Convex Auth
 * sign-in to materialise the account + starter creature for the authenticated user.
 * No githubLogin/secret args — identity comes from Convex Auth.
 */

import { mutation } from "./_generated/server";
import { ensureAccount } from "./lib/auth";

export const getOrCreateAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const account = await ensureAccount(ctx);
    const entity = await ctx.db
      .query("entities")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .first();
    return {
      accountId: account._id,
      githubLogin: account.githubLogin ?? null,
      entityId: entity?.entityId ?? null,
    };
  },
});
