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

  return (
    <div className="auth">
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          const data = new FormData(event.currentTarget);
          data.set("flow", flow);
          void signIn("password", data).catch(() => setError("Sign-in failed"));
        }}
      >
        <input name="email" type="email" placeholder="email" autoComplete="email" required />
        <input
          name="password"
          type="password"
          placeholder="password"
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          required
        />
        <button type="submit">{flow === "signIn" ? "Sign in" : "Sign up"}</button>
      </form>

      <button className="link" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
        {flow === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>

      <button onClick={() => void signIn("github").catch(() => setError("GitHub sign-in failed"))}>
        Sign in with GitHub
      </button>

      {error && <span className="hint">{error}</span>}
    </div>
  );
}
