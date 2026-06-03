/**
 * Identity → account resolution. Trust comes from Convex Auth.
 *
 * IMPORTANT: key accounts by the stable USER id (`getAuthUserId`), NOT by
 * `getUserIdentity().subject` — Convex Auth's subject is `${userId}|${sessionId}`, so
 * keying on it mints a brand-new account per sign-in / token refresh / surface (the app
 * and the daemon land on different auth sessions). The user id is stable across all of
 * them, so the app and the headless daemon share one account. `authSubject` (the column)
 * now stores that user id.
 */

import { newStats } from "@agent-idle/engine";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The authenticated account, or null if unauthenticated / not yet created. Read-only. */
export async function currentAccount(ctx: QueryCtx | MutationCtx): Promise<Doc<"accounts"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return ctx.db
    .query("accounts")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", userId))
    .first();
}

/**
 * Resolve the authenticated account, creating it on first call. Throws if the caller
 * is unauthenticated. Mutations only.
 *
 * NOTE: no starter pet is created here — pets spawn per Claude Code session via the
 * `register` event (see events.ts). A brand-new player simply has an empty menagerie
 * until their first session is registered.
 */
export async function ensureAccount(ctx: MutationCtx): Promise<Doc<"accounts">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Not authenticated");

  const existing = await ctx.db
    .query("accounts")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", userId))
    .first();
  if (existing) return existing;

  // Identity is still used for the display name (GitHub login), just not as the key.
  const identity = await ctx.auth.getUserIdentity();
  const githubLogin =
    (identity?.nickname as string | undefined) ??
    (identity?.preferredUsername as string | undefined) ??
    identity?.name ??
    undefined;

  const accountId = await ctx.db.insert("accounts", {
    authSubject: userId,
    githubLogin,
    visibility: "private",
    verified: true, // identity is GitHub-verified through Convex Auth
    seasonStats: newStats(),
    lifetimeStats: newStats(),
  });

  const created = await ctx.db.get(accountId);
  if (!created) throw new Error("account creation failed");
  return created;
}
