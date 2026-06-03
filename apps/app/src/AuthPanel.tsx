/**
 * Sign-in panel. Two Convex Auth methods:
 *  - Password (email + password) — the default, in-app, no browser.
 *  - GitHub OAuth — for the verified/public leaderboard identity.
 *
 * On success the app's token is pushed to the daemon's shared loopback port (see
 * App.tsx) so the CLI + daemon authenticate as the same user.
 */

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export function AuthPanel() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);

  // Convex throws ConvexError (message in `.data`) or a plain Error — surface the real text.
  const messageOf = (e: unknown): string => {
    if (e && typeof e === "object" && "data" in e && typeof (e as { data: unknown }).data === "string") {
      return (e as { data: string }).data;
    }
    return e instanceof Error ? e.message : "Sign-in failed";
  };

  return (
    <div className="auth">
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const data = new FormData(event.currentTarget);
          data.set("flow", flow);
          void signIn("password", data).catch((e) => setError(messageOf(e)));
        }}
      >
        <input name="email" type="email" placeholder="email" autoComplete="email" required />
        <input
          name="password"
          type="password"
          placeholder="password (min 8 characters)"
          minLength={8}
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          required
        />
        <button type="submit">{flow === "signIn" ? "Sign in" : "Sign up"}</button>
      </form>

      <button className="link" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
        {flow === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>

      <button onClick={() => void signIn("github").catch((e) => setError(messageOf(e)))}>
        Sign in with GitHub
      </button>
      <span className="hint">GitHub requires AUTH_GITHUB_ID / AUTH_GITHUB_SECRET on the deployment</span>

      {error && <span className="hint">{error}</span>}
    </div>
  );
}
