import GitHub from "@auth/core/providers/github";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

/**
 * Convex Auth — the authoritative identity for the whole system. Protected functions
 * read `ctx.auth.getUserIdentity()` and key an account off it. Two methods:
 *  - Password (email + password): the default, works with no browser (in-app form, and
 *    the CLI can drive it via the app's auth page).
 *  - GitHub OAuth: browser-based; needed for the public "verified" leaderboard identity.
 *
 * GitHub sign-in requires AUTH_GITHUB_ID / AUTH_GITHUB_SECRET on the deployment (from a
 * GitHub OAuth App) — until set, the provider is wired but GitHub login won't complete:
 *   npx convex env set AUTH_GITHUB_ID <id>
 *   npx convex env set AUTH_GITHUB_SECRET <secret>
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, GitHub],
});
