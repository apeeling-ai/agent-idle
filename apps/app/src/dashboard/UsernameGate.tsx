/**
 * Mandatory username onboarding. Every signed-in player must pick a globally-unique handle before
 * they can use the app — it becomes their display name everywhere (retiring "anonymous") and is how
 * friends add them. The shells render <UsernameSetup> instead of their content while `needsUsername`
 * is true; the moment `setUsername` succeeds, the reactive getPlayerState updates, `needsUsername`
 * flips false, and the gate falls through automatically.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex";
import "./dashboard.css";

/** The getPlayerState shape this gate cares about — kept loose so any shell can pass its `remote`. */
type AccountState = { account?: { username?: string | null } | null } | null | undefined;

/**
 * Should the username gate block the app? True only once we KNOW the account lacks a handle:
 * `undefined` is still-loading (don't gate yet); `null` is authenticated-but-no-account-row-yet
 * (must onboard); a present account with no username must onboard too. Call only when authenticated.
 */
export function needsUsername(remote: AccountState): boolean {
  if (remote === undefined) return false; // first read still in flight
  if (remote === null) return true; // signed in, account not created yet
  return remote.account?.username == null;
}

export function UsernameSetup() {
  const setUsername = useMutation(api.friends.setUsername);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Light client-side gate for the button; the server is authoritative (format + profanity +
  // uniqueness) and returns the real error on submit.
  const tooShort = value.trim().length < 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tooShort || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await setUsername({ username: value });
      if (!res.ok) setError(res.error ?? "That username isn't available.");
      // On success: do nothing — the reactive query drops this gate.
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="username-gate">
      <form className="username-card" onSubmit={submit}>
        <h2 className="username-card__title">Choose your username</h2>
        <p className="username-card__sub">
          This is how you appear on the leaderboard and how friends add you. Letters, numbers, and
          underscores — 3–20 characters.
        </p>
        <div className="username-card__field">
          <span className="username-card__at">@</span>
          <input
            className="username-card__input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="your_handle"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            aria-label="Username"
          />
        </div>
        {error ? <p className="username-card__error">{error}</p> : null}
        <button type="submit" className="username-card__submit" disabled={tooShort || submitting}>
          {submitting ? "Saving…" : "Claim username"}
        </button>
      </form>
    </div>
  );
}
