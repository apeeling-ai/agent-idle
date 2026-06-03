/**
 * Account bootstrap. The app calls `getOrCreateAccount` right after Convex Auth
 * sign-in to materialise the account for the authenticated user. No starter pet is
 * created — pets spawn per Claude Code session (see events.ts). No githubLogin/secret
 * args — identity comes from Convex Auth.
 */

import { mutation } from "./_generated/server";
import { ensureAccount } from "./lib/auth";

export const getOrCreateAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const account = await ensureAccount(ctx);
    return {
      accountId: account._id,
      githubLogin: account.githubLogin ?? null,
    };
  },
});
