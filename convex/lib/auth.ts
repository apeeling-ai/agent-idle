/**
 * Identity → account resolution. Trust comes from Convex Auth: `getUserIdentity()`
 * returns the verified GitHub identity, and every account is keyed by its subject.
 * This is what makes the leaderboard credible without any client-held secret.
 */

import { newEntity, newStats } from "@agent-idle/engine";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The authenticated account, or null if unauthenticated / not yet created. Read-only. */
export async function currentAccount(ctx: QueryCtx | MutationCtx): Promise<Doc<"accounts"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("accounts")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
    .first();
}

/**
 * Resolve the authenticated account, creating it (and its starter creature) on first
 * call. Throws if the caller is unauthenticated. Mutations only.
 */
export async function ensureAccount(ctx: MutationCtx): Promise<Doc<"accounts">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const existing = await ctx.db
    .query("accounts")
    .withIndex("by_authSubject", (q) => q.eq("authSubject", identity.subject))
    .first();
  if (existing) return existing;

  const githubLogin =
    (identity.nickname as string | undefined) ??
    (identity.preferredUsername as string | undefined) ??
    identity.name ??
    undefined;

  const accountId = await ctx.db.insert("accounts", {
    authSubject: identity.subject,
    githubLogin,
    visibility: "private",
    verified: true, // identity is GitHub-verified through Convex Auth
    seasonStats: newStats(),
    lifetimeStats: newStats(),
  });

  const now = Date.now();
  const entityId = crypto.randomUUID();
  const starter = newEntity({ id: entityId, name: "Pixel", species: "knight", now });
  await ctx.db.insert("entities", {
    accountId,
    entityId,
    species: starter.species,
    name: starter.name,
    resources: starter.resources,
    cosmetics: starter.cosmetics,
    mode: starter.mode,
    lastUpdated: starter.lastUpdated,
    cachedStatus: "healthy",
    cachedAlive: true,
  });
  await ctx.db.insert("saves", { ownerId: accountId, entities: [entityId], updatedAt: now });

  const created = await ctx.db.get(accountId);
  if (!created) throw new Error("account creation failed");
  return created;
}
