import { useEffect, useState } from "react";
import { seasonNumber } from "@agent-idle/engine";
import { DecorationIcon, PrizeIcon, TrophyIcon } from "../render/DecorationIcon";
import { formatTokens } from "./format";
import type { LeaderboardData } from "./types";

type Scope = "today" | "season";

const SCOPES: { key: Scope; label: string; title: string }[] = [
  { key: "today", label: "Today", title: "Today's grind" },
  { key: "season", label: "Season", title: "Season grind" },
];

/** The three podium places + the tier each wins. The prize escalates by tier (gold/silver/bronze),
 * so 1st/2nd/3rd are visibly distinct rather than the same ornament three times. */
const PODIUM = [
  { place: 1, label: "1st", tier: "Gold" },
  { place: 2, label: "2nd", tier: "Silver" },
  { place: 3, label: "3rd", tier: "Bronze" },
];

/** "5d 3h" / "3h 12m" / "12m" / "<1m" — coarse, human countdown to a future epoch-ms target. */
function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return "0m";
  const mins = Math.floor(msLeft / 60_000);
  const days = Math.floor(mins / (60 * 24));
  const hours = Math.floor((mins % (60 * 24)) / 60);
  const m = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${m}m`;
  return m > 0 ? `${m}m` : "<1m";
}

/** The season header strip: a clickable live countdown to the season's end + the reward each
 * podium place wins (the season's themed trophy, hung on the winner's cabin). Clicking the
 * countdown opens a detail popover explaining the season's rewards. */
function SeasonBanner({
  seasonIndex,
  endsAt,
  reward,
}: {
  seasonIndex?: number;
  endsAt?: number;
  reward?: { kind: string; glyph: string; label: string };
}) {
  // Re-render each minute so the countdown stays live while the dashboard is open.
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const label = seasonIndex != null ? `Season ${seasonNumber(seasonIndex)}` : "This season";

  return (
    <div className="lb-season">
      {endsAt ? (
        <button
          type="button"
          className="lb-season__countdown lb-season__countdown--btn"
          onClick={() => setOpen((v) => !v)}
          title="See this season's rewards"
        >
          ⏳ Season ends in <b>{formatCountdown(endsAt - now)}</b> <span className="lb-season__caret">ⓘ</span>
        </button>
      ) : null}
      <div className="lb-season__rewards">
        <span className="lb-season__rewards-label">Rewards</span>
        {PODIUM.map((p) => (
          <span
            key={p.place}
            className="lb-season__reward"
            title={reward ? `${p.label} → ${p.tier} ${reward.label}` : p.label}
          >
            {reward ? (
              <span className="lb-season__prize">
                <PrizeIcon kind={reward.kind} place={p.place} size={20} />
              </span>
            ) : null}
            <b>{p.label}</b>
          </span>
        ))}
      </div>

      {open ? (
        <div className="lb-rewards" role="dialog" aria-label={`${label} rewards`}>
          <button type="button" className="lb-rewards__scrim" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="lb-rewards__panel">
            <div className="lb-rewards__head">
              <span className="lb-rewards__title">
                <TrophyIcon size={14} /> {label} rewards
              </span>
              <button type="button" className="lb-rewards__close" aria-label="Close" onClick={() => setOpen(false)}>
                x
              </button>
            </div>
            {endsAt ? (
              <p className="lb-rewards__ends">⏳ Ends in {formatCountdown(endsAt - now)}</p>
            ) : null}
            {reward ? (
              <div className="lb-rewards__prize">
                <DecorationIcon kind={reward.kind} size={34} />
                <div>
                  <div className="lb-rewards__prize-name">{reward.label}</div>
                  <div className="lb-rewards__prize-sub">this season's ornament — kept by everyone who scores</div>
                </div>
              </div>
            ) : null}
            <ul className="lb-rewards__podium">
              {PODIUM.map((p) => (
                <li key={p.place}>
                  {reward ? <PrizeIcon kind={reward.kind} place={p.place} size={26} /> : null}
                  <span className="lb-rewards__place">
                    <b>{p.label}</b> · {p.tier} {reward ? reward.label : "trophy"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="lb-rewards__note">
              Top 3 win the season trophy in gold / silver / bronze; everyone who scores keeps the
              plain ornament on their cabin.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The public leaderboard as a terminal-style table, with a Today / Season toggle. "Today" is
 * the daily board; "Season" is the running 2-week season (resets when the season rolls over). The
 * caller's own row is accented like the player label in the diorama (bright moss, left border). */
export function Leaderboard({ daily, season }: { daily: LeaderboardData; season: LeaderboardData }) {
  const [scope, setScope] = useState<Scope>("season");
  const active = SCOPES.find((s) => s.key === scope) ?? SCOPES[0];
  const data = scope === "today" ? daily : season;
  const { entries, you } = data;
  const youInList = entries.some((e) => e.isYou);
  const empty =
    scope === "today"
      ? "No public scores yet today. Be the first to grind!"
      : "No public scores yet this season. Be the first to grind!";

  return (
    <div className="lb">
      <section className="panel">
        <div className="trends__head">
          <h3 className="panel__title">
            {active.title} <span className="panel__hint">public players</span>
          </h3>
          <div className="seg">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`seg__btn ${s.key === scope ? "seg__btn--on" : ""}`}
                onClick={() => setScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {scope === "season" ? (
          <SeasonBanner seasonIndex={season.season} endsAt={season.seasonEndsAt} reward={season.reward} />
        ) : null}

        {entries.length === 0 ? (
          <p className="lb__empty">{empty}</p>
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
