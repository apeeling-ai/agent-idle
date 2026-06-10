/**
 * The browser sign-in card. Same two Convex Auth methods as the Tauri panel (Password +
 * GitHub) — this is just the full-page-friendly presentation, with its own copy and states.
 * On success the app pushes its token to the daemon (see world.ts) so a `agent-idle login`
 * that opened this page completes.
 */

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export function AuthCard({ onClose, cliLogin = false }: { onClose?: () => void; cliLogin?: boolean }) {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const messageOf = (e: unknown): string => {
    if (e && typeof e === "object" && "data" in e && typeof (e as { data: unknown }).data === "string") {
      return (e as { data: string }).data;
    }
    return e instanceof Error ? e.message : "Sign-in failed";
  };

  return (
    <div className="auth-card" role="dialog" aria-modal="true" aria-label="Sign in to Agent Idle">
      {onClose ? (
        <button type="button" className="auth-card__dismiss" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      ) : null}

      <p className="eyebrow auth-card__eyebrow">{cliLogin ? "Connect your machine" : "Enter the world"}</p>
      <h2 className="auth-card__title">{flow === "signIn" ? "Sign in" : "Create your account"}</h2>
      <p className="auth-card__lede">
        {cliLogin
          ? "Sign in to link this machine to your world. You can return to the terminal once it connects."
          : "One account follows you across every machine. Your pets and progress sync automatically."}
      </p>

      <form
        className="auth-card__form"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setBusy(true);
          const data = new FormData(event.currentTarget);
          data.set("flow", flow);
          void signIn("password", data)
            .catch((e) => setError(messageOf(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="auth-field">
          <span>Email</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the card only mounts as a modal on demand */}
          <input name="email" type="email" placeholder="you@studio.dev" autoComplete="email" autoFocus required />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            name="password"
            type="password"
            placeholder="at least 8 characters"
            minLength={8}
            autoComplete={flow === "signIn" ? "current-password" : "new-password"}
            required
          />
        </label>
        <button type="submit" className="btn btn--gold auth-card__submit" disabled={busy}>
          {busy ? "One moment…" : flow === "signIn" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="auth-card__or"><span>or</span></div>

      <button
        type="button"
        className="btn btn--ghost auth-card__github"
        onClick={() => {
          setError(null);
          void signIn("github").catch((e) => setError(messageOf(e)));
        }}
      >
        <span aria-hidden>⌥</span> Continue with GitHub
      </button>

      <button
        type="button"
        className="auth-card__switch"
        onClick={() => {
          setError(null);
          setFlow(flow === "signIn" ? "signUp" : "signIn");
        }}
      >
        {flow === "signIn" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>

      {error ? <p className="auth-card__error" role="alert">{error}</p> : null}
    </div>
  );
}
