import GitHub from "@auth/core/providers/github";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

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
  providers: [
    // Default policy is 8+ chars WITH upper/lower/digit and surfaces as an opaque
    // "Invalid password". Relax to a clear minimum-length rule for a smooth dev UX.
    Password({
      validatePasswordRequirements: (password: string) => {
        if (password.length < 8) {
          throw new ConvexError("Password must be at least 8 characters.");
        }
      },
    }),
    GitHub,
  ],
});
