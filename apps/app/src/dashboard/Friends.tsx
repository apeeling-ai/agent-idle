/**
 * The Friends management tab: your handle, add-by-username, pending requests (in + out), and your
 * friends list with remove. Pure + backend-agnostic — all data and callbacks arrive as props
 * (`DashboardFriends`), the shells own the Convex wiring. The friends-only LEADERBOARD lives in the
 * Leaderboard tab's Global/Friends filter, not here; this tab is for managing the relationships.
 */

import { useState } from "react";
import { ShareProgress } from "./ShareProgress";
import type { ShareStats } from "./shareCard";
import type { AddFriendResult, DashboardFriends } from "./types";

/** The Friends tab manages relationships; it doesn't render the leaderboard, so it takes every
 * DashboardFriends field except `leaderboard`. Plus the player's own progress, for the share card. */
type FriendsProps = Omit<DashboardFriends, "leaderboard"> & { share?: ShareStats };

function statusMessage(res: AddFriendResult): { ok: boolean; text: string } {
  if (!res.ok) return { ok: false, text: res.error ?? "Couldn't send request." };
  switch (res.status) {
    case "accepted":
      return { ok: true, text: "You're now friends! 🎉" };
    case "already_friends":
      return { ok: true, text: "You're already friends." };
    case "pending":
      return { ok: true, text: "You've already sent them a request." };
    default:
      return { ok: true, text: "Request sent." };
  }
}

export function Friends({ overview, share, onAdd, onAccept, onDecline, onCancel, onRemove }: FriendsProps) {
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = input.trim();
    if (!name || sending) return;
    setSending(true);
    setMsg(null);
    const res = await onAdd(name);
    setMsg(statusMessage(res));
    if (res.ok && res.status === "requested") setInput("");
    setSending(false);
  };

  if (overview === undefined) {
    return <p className="dash__loading">Loading friends…</p>;
  }

  const { myUsername, friends, incoming, outgoing } = overview;

  return (
    <div className="friends">
      <ShareProgress stats={share} />

      <section className="panel">
        <h3 className="panel__title">
          Your handle{" "}
          {myUsername ? <span className="friends__handle">@{myUsername}</span> : null}
          <span className="panel__hint">share it so friends can add you</span>
        </h3>
        <form className="friends__add" onSubmit={submit}>
          <span className="friends__at">@</span>
          <input
            className="friends__input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (msg) setMsg(null);
            }}
            placeholder="add a friend by username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={20}
            aria-label="Friend's username"
          />
          <button type="submit" className="friends__add-btn" disabled={!input.trim() || sending}>
            {sending ? "…" : "Add"}
          </button>
        </form>
        {msg ? (
          <p className={`friends__msg ${msg.ok ? "friends__msg--ok" : "friends__msg--err"}`}>{msg.text}</p>
        ) : null}
      </section>

      {incoming.length > 0 ? (
        <section className="panel">
          <h3 className="panel__title">
            Friend requests <span className="panel__hint">{incoming.length}</span>
          </h3>
          <ul className="friends__list">
            {incoming.map((r) => (
              <li key={r.requestId} className="friends__row">
                <span className="friends__name">{r.name}</span>
                <span className="friends__actions">
                  <button type="button" className="friends__btn friends__btn--ok" onClick={() => onAccept(r.requestId)}>
                    Accept
                  </button>
                  <button type="button" className="friends__btn" onClick={() => onDecline(r.requestId)}>
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h3 className="panel__title">
          Friends <span className="panel__hint">{friends.length}</span>
        </h3>
        {friends.length === 0 ? (
          <p className="lb__empty">No friends yet — add someone by their username above.</p>
        ) : (
          <ul className="friends__list">
            {friends.map((f) => (
              <li key={f.accountId} className="friends__row">
                <span className="friends__name">{f.name}</span>
                <button
                  type="button"
                  className="friends__btn friends__btn--danger"
                  onClick={() => onRemove(f.accountId)}
                  title={`Remove ${f.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="panel">
          <h3 className="panel__title">
            Sent requests <span className="panel__hint">{outgoing.length}</span>
          </h3>
          <ul className="friends__list">
            {outgoing.map((r) => (
              <li key={r.requestId} className="friends__row">
                <span className="friends__name friends__name--pending">{r.name}</span>
                <button type="button" className="friends__btn" onClick={() => onCancel(r.requestId)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
