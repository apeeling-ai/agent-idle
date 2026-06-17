import { DecorationIcon, MedalIcon } from "../render/DecorationIcon";
import { formatTokens } from "./format";
import type { SeasonHistoryEntry } from "./types";

/** Season history — every past season with its podium (top-3) and the season's themed trophy.
 * Newest season first; the caller's own row is accented like elsewhere. */
export function SeasonHistory({ seasons }: { seasons: SeasonHistoryEntry[] | null | undefined }) {
  if (seasons === undefined) {
    return <p className="dash__loading">Loading season history…</p>;
  }
  if (!seasons || seasons.length === 0) {
    return (
      <div className="seasons">
        <section className="panel">
          <p className="lb__empty">No finished seasons yet — the first wraps up at the 2-week mark.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="seasons">
      {seasons.map((s) => (
        <section className="panel season-card" key={s.season}>
          <div className="season-card__head">
            <span className="season-card__trophy">
              <DecorationIcon kind={s.reward.kind} size={24} />
            </span>
            <div className="season-card__heading">
              <h3 className="season-card__title">Season {s.number}</h3>
              <span className="season-card__reward">{s.reward.label}</span>
            </div>
          </div>
          <ol className="season-podium">
            {s.top.map((e) => (
              <li key={`${s.season}-${e.rank}`} className={`season-podium__row ${e.isYou ? "season-podium__row--you" : ""}`}>
                <span className="season-podium__medal">
                  <MedalIcon place={e.rank} size={18} />
                </span>
                <span className="season-podium__name">
                  {e.name}
                  {e.isYou ? " (you)" : ""}
                </span>
                <span className="season-podium__tokens">🪙 {formatTokens(e.tokens)}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
