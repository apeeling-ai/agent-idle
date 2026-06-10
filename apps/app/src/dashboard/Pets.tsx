import { useState } from "react";
import { EffortBar } from "./EffortBar";
import { formatDuration, formatTokens } from "./format";
import type { PetStat } from "./types";

/** Species → a glyph; pets are the player's Claude Code sessions. */
const SPECIES_GLYPH: Record<string, string> = { knight: "⚔️", wizard: "🧙", rogue: "🗡️" };
const MEDALS = ["🥇", "🥈", "🥉"];

function stateOf(p: PetStat): "active" | "idle" | "dead" {
  return !p.alive ? "dead" : p.activity === "active" ? "active" : "idle";
}

/** Short "Jun 3" date for a timestamp (local). */
function dateLabel(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A clicked pet's full card: lifespan, turns, quality, intensity + its tool-mix. */
function PetDetail({ pet, rank, onBack }: { pet: PetStat; rank: number; onBack: () => void }) {
  const state = stateOf(pet);
  const avgTokens = pet.promptCount > 0 ? pet.tokensFed / pet.promptCount : 0;
  const avgQuality = pet.promptCount > 0 ? pet.promptQualitySum / pet.promptCount : 0;
  const workedMs =
    pet.actionMs.shell +
    pet.actionMs.edit +
    pet.actionMs.read +
    pet.actionMs.web +
    pet.actionMs.thinking;
  // The tool this session leaned on most (idle excluded).
  const tools: [string, number][] = [
    ["shell", pet.actionMs.shell],
    ["edit", pet.actionMs.edit],
    ["read", pet.actionMs.read],
    ["web", pet.actionMs.web],
    ["thinking", pet.actionMs.thinking],
  ];
  const topTool = tools.reduce((a, b) => (b[1] > a[1] ? b : a), ["—", 0] as [string, number]);

  return (
    <section className="panel pet-detail">
      <button type="button" className="pet-detail__back" onClick={onBack}>
        ← all agents
      </button>
      <div className="pet-detail__head">
        <span className="pets__glyph" aria-hidden>
          {SPECIES_GLYPH[pet.species] ?? "🤖"}
        </span>
        <div className="pet-detail__title">
          <span className="pet-detail__name">{pet.name}</span>
          <span className={`pets__state pets__state--${state}`}>
            #{rank} · {pet.species} · {state === "active" ? "working" : state === "dead" ? "retired" : "resting"}
          </span>
        </div>
        <span className="pet-detail__tokens">🪙 {formatTokens(pet.tokensFed)}</span>
      </div>

      <div className="pet-detail__grid">
        <Stat label="Turns" value={`${pet.promptCount}`} />
        <Stat label="Top tool" value={topTool[1] > 0 ? topTool[0] : "—"} />
        <Stat label="Tokens / turn" value={formatTokens(avgTokens)} />
        <Stat label="Avg quality" value={avgQuality > 0 ? `${Math.round(avgQuality * 100)}%` : "—"} />
        <Stat label="Worked" value={formatDuration(workedMs)} />
        <Stat label="Born" value={dateLabel(pet.bornAt)} />
        <Stat label="Last active" value={dateLabel(pet.lastUpdated)} />
        <Stat label="Lifespan" value={formatDuration(Math.max(0, pet.lastUpdated - pet.bornAt))} />
      </div>

      <h4 className="pet-detail__h">Time spent</h4>
      <EffortBar actionMs={pet.actionMs} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pet-stat">
      <span className="pet-stat__value">{value}</span>
      <span className="pet-stat__label">{label}</span>
    </div>
  );
}

/** The account's agents, ranked by lifetime tokens — a personal hall of fame (all-time, so
 * retired/dead sessions still count). Click any agent for its full session profile. */
export function Pets({ pets }: { pets: PetStat[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = pets.reduce((s, p) => s + p.tokensFed, 0);
  const alive = pets.filter((p) => p.alive).length;

  if (selected !== null && pets[selected]) {
    return (
      <div className="pets">
        <PetDetail pet={pets[selected]} rank={selected + 1} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="pets">
      <section className="panel">
        <h3 className="panel__title">
          Your agents <span className="panel__hint">ranked by tokens · all-time</span>
        </h3>

        {pets.length === 0 ? (
          <p className="lb__empty">No agents yet — start a Claude Code session to hatch one.</p>
        ) : (
          <>
            <ol className="pets__list">
              {pets.map((p, i) => {
                const state = stateOf(p);
                return (
                  <li key={`${p.name}-${i}`}>
                    <button
                      type="button"
                      className={`pets__row ${p.alive ? "" : "pets__row--dead"}`}
                      onClick={() => setSelected(i)}
                    >
                      <span className="pets__rank">{MEDALS[i] ?? i + 1}</span>
                      <span className="pets__glyph" aria-hidden>
                        {SPECIES_GLYPH[p.species] ?? "🤖"}
                      </span>
                      <span className="pets__name">
                        {p.name}
                        <span className={`pets__state pets__state--${state}`}>
                          {state === "active" ? "working" : state === "dead" ? "retired" : "resting"} · {p.promptCount} turns
                        </span>
                      </span>
                      <span className="pets__tokens">🪙 {formatTokens(p.tokensFed)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="trends__foot">
              {pets.length} agents · {alive} alive · 🪙 {formatTokens(total)} fed all-time
            </p>
          </>
        )}
      </section>
    </div>
  );
}
