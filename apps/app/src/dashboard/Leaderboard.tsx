import { formatTokens } from "./format";
import type { LeaderboardData } from "./types";

/** Today's daily leaderboard as a terminal-style table. The caller's own row is accented
 * like the player label in the diorama (bright moss, left border). */
export function Leaderboard({ data }: { data: LeaderboardData }) {
  const { entries, you } = data;
  const youInList = entries.some((e) => e.isYou);

  return (
    <div className="lb">
      <section className="panel">
        <h3 className="panel__title">
          Today's grind <span className="panel__hint">public players</span>
        </h3>

        {entries.length === 0 ? (
          <p className="lb__empty">No public scores yet today. Be the first to grind!</p>
        ) : (
          <ol className="lb__list">
            {entries.map((e, i) => (
              <li key={`${e.name}-${i}`} className={`lb__row ${e.isYou ? "lb__row--you" : ""}`}>
                <span className="lb__rank">{i + 1}</span>
                <span className="lb__name">
                  {e.name}
                  {e.isYou ? " (you)" : ""}
                </span>
                <span className="lb__score">🪙 {formatTokens(e.tokens)}</span>
              </li>
            ))}
          </ol>
        )}

        {you && !youInList ? (
          <div className="lb__you">
            <span className="lb__rank">{you.rank}</span>
            <span className="lb__name">you{you.total ? ` · #${you.rank} of ${you.total}` : ""}</span>
            <span className="lb__score">🪙 {formatTokens(you.tokens)}</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
