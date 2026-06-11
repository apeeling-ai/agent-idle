/**
 * The browser landing page — pitched at developers who already run Claude Code or Codex (and
 * the page `agent-idle login` opens). The hero pairs terminal-first copy with the real game
 * running live (LiveDiorama); then the page proves itself the way a tool would: the pipeline
 * drawn as the system it is (hook → daemon → reducer), a spec-sheet readout of the engineering
 * guarantees, the game world, and the privacy stance shown as the actual schema.
 *
 * Every technical claim here is checked against the code it describes: the hook contract
 * (cli/hook.ts), the outbox (cli/outbox.ts), lazy decay (engine/decay), the scoring flag
 * (engine config.ts SCORING.includePromptQualityInScore), and the `stats` shape + privacy
 * comment in convex/schema.ts. Keep them in sync.
 */

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { LiveDiorama } from "./LiveDiorama";
import { AuthCard } from "./AuthCard";

/** The diorama rooms, straight from the game's ZONE_INFO — each agent tool sends a pet to its
 * own room. Colours mirror the in-game palette (theme.css --act-*). */
const ROOMS = [
  { name: "The Mine", action: "Bash & test runs", blurb: "Shell commands swing a pickaxe for ore.", color: "var(--act-shell)" },
  { name: "The Lumber Yard", action: "Edit & Write", blurb: "Every applied diff is a felled tree.", color: "var(--act-edit)" },
  { name: "The Grove", action: "Read & Grep", blurb: "File reads and searches forage the underbrush.", color: "var(--act-read)" },
  { name: "The Pond", action: "WebFetch & Search", blurb: "Web requests cast a line out over the water.", color: "var(--act-web)" },
  { name: "The Camp", action: "Between turns", blurb: "Idle sessions gather at the fire and rest up.", color: "var(--act-idle)" },
];

/** The pipeline, drawn as the system it is — each node is the real component doing the work. */
const PIPELINE = [
  { name: "claude · codex", color: "var(--parch)", lines: ["your agent, untouched", "hooks fire on every event"] },
  { name: "agent-idle hook", color: "var(--gold)", lines: ["reads stdin, POSTs, exits 0", "never blocks a turn"] },
  { name: "daemon", color: "var(--moss)", lines: ["appraises prompts on-device", "durable outbox, retries"] },
  { name: "convex", color: "var(--act-web)", lines: ["append-only event ledger", "one pure reducer writes state"] },
];
const PIPE_LINKS = ["stdin json", "loopback post", "idempotent events"];

/** Engineering guarantees, read like a spec sheet — the section a developer skims to decide
 * whether this is a toy. */
const SPEC: Array<[string, ReactNode]> = [
  ["added latency", <>≈0 ms — the hook reads stdin, POSTs to loopback, and exits 0; all real work is async in the daemon</>],
  ["delivery", <>at-least-once; idempotent <code>clientEventId</code>s make redelivery harmless</>],
  ["offline", <>durable outbox at <code>~/.agent-idle/outbox.jsonl</code>, flushed with retry</>],
  ["background load", <>none — liveness derives from elapsed time at read; no tick, no polling</>],
  ["state authority", <>server-only writer; clients emit events, never totals</>],
  ["consistency", <>one pure TypeScript reducer shared by the daemon, the browser, and the server</>],
  ["agents", <>Claude Code &amp; Codex — same hook events, same stdin JSON, one daemon serves both</>],
  ["leaderboard", <>server-recomputable signals only; locally computed prompt quality feeds your pet, never your rank</>],
];

export function Home({ cliLogin = false }: { cliLogin?: boolean }) {
  const [authOpen, setAuthOpen] = useState(cliLogin);
  const openAuth = () => setAuthOpen(true);

  // Close the modal on Escape.
  useEffect(() => {
    if (!authOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAuthOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authOpen]);

  return (
    <div className="home">
      <header className="home-header">
        <a className="wordmark" href="#top">
          <span className="wordmark__glyph" aria-hidden>✥</span>
          <span className="wordmark__text">Agent&nbsp;Idle</span>
        </a>
        <nav className="home-nav" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#engineering">Under the hood</a>
          <a href="#world">The world</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <button type="button" className="btn btn--gold home-header__cta" onClick={openAuth}>
          Sign in
        </button>
      </header>

      <main id="top">
        {/* HERO — the thesis, terminal first. */}
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Built on Claude Code &amp; Codex hooks</p>
            <h1 className="hero__title">
              Hook events in. <span className="hero__title-accent">Pixel creatures out.</span>
            </h1>
            <p className="hero__lede">
              Agent Idle turns every coding-agent session into a pixel creature mining tokens in
              an ambient world on a spare monitor. It rides the hooks you already have, appraises
              everything locally, and adds zero latency to your turns.
            </p>
            <div className="hero__cta">
              <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
                Sign in to start
              </button>
              <a className="btn btn--ghost btn--lg" href="#how">See the pipeline</a>
            </div>
            <pre className="terminal" aria-label="Terminal: connect your machine">
              <code>
                <span className="terminal__prompt">$</span> agent-idle setup{"\n"}
                <span className="terminal__out">→ registered hooks in ~/.claude/settings.json</span>{"\n"}
                <span className="terminal__prompt">$</span> agent-idle login{"\n"}
                <span className="terminal__out">→ opens your browser · links this machine</span>{"\n"}
                <span className="terminal__out"># done — the daemon auto-starts on the first hook</span>
              </code>
            </pre>
          </div>
          <div className="hero__stage">
            <div className="hero__stage-frame">
              <span className="hero__live">Live</span>
              <LiveDiorama />
            </div>
            <p className="hero__stage-caption">A real diorama, running right now — pets mine as their sessions work.</p>
          </div>
        </section>

        {/* HOW IT WORKS — the actual pipeline, drawn end to end. */}
        <section id="how" className="band how">
          <p className="eyebrow eyebrow--center">The pipeline</p>
          <h2 className="band__title">Hook → daemon → reducer</h2>
          <p className="band__lede">
            No wrapper, no proxy, no IDE plugin — it rides the hook interface your agent already
            exposes.
          </p>
          <div className="pipeline" role="list" aria-label="Event pipeline">
            {PIPELINE.map((node, i) => (
              <Fragment key={node.name}>
                {i > 0 ? (
                  <div className="pipe-link" aria-hidden>
                    <span className="pipe-link__label">{PIPE_LINKS[i - 1]}</span>
                    <span className="pipe-link__line" />
                  </div>
                ) : null}
                <article className="pnode" role="listitem" style={{ ["--node" as string]: node.color }}>
                  <h3 className="pnode__bar">
                    <span className="pnode__dot" aria-hidden />
                    {node.name}
                  </h3>
                  <ul className="pnode__lines">
                    {node.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </article>
              </Fragment>
            ))}
          </div>
          <p className="pipeline-note">
            …then the world re-renders reactively. The diorama in the hero is that same query, live.
          </p>
        </section>

        {/* UNDER THE HOOD — the guarantees, read like a spec sheet. */}
        <section id="engineering" className="band engineering">
          <p className="eyebrow eyebrow--center">Under the hood</p>
          <h2 className="band__title">Built like a tool, not a toy</h2>
          <p className="band__lede">
            It sits in your agent's hot path, so it's engineered like anything else you'd let in
            there.
          </p>
          <div className="spec">
            <div className="spec__bar">agent-idle --spec</div>
            <dl className="spec__list">
              {SPEC.map(([key, val]) => (
                <div className="spec__row" key={key}>
                  <dt className="spec__key">{key}</dt>
                  <dd className="spec__val">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* THE WORLD — the rooms, drawn from the real game zones. */}
        <section id="world" className="band world">
          <p className="eyebrow eyebrow--center">The world</p>
          <h2 className="band__title">Every tool is a room</h2>
          <p className="band__lede">
            A pet stands wherever its session is working. When your agent switches from editing
            to running tests, you'll see it walk from the lumber yard to the mine.
          </p>
          <div className="rooms">
            {ROOMS.map((r) => (
              <article className="room" key={r.name} style={{ ["--room" as string]: r.color }}>
                <span className="room__action">{r.action}</span>
                <h3 className="room__name">{r.name}</h3>
                <p className="room__blurb">{r.blurb}</p>
              </article>
            ))}
          </div>
        </section>

        {/* PROGRESSION — the idle-game payoff. */}
        <section className="band progression">
          <div className="progression__text">
            <p className="eyebrow">Number go up</p>
            <h2 className="band__title">Ship more, gear up</h2>
            <p className="band__lede">
              Lifetime tokens are the only currency. They unlock armor, helms, and weapons for
              your hero — bronze through prismatic — and an unbounded prestige level above your
              name. There is nothing to grind, no daily quest, no notification. You just keep
              coding.
            </p>
          </div>
          <div className="ladder" aria-hidden>
            {["Bronze", "Iron", "Steel", "Mythic", "Prismatic"].map((tier, i) => (
              <div className="ladder__rung" key={tier} style={{ ["--rung" as string]: `${0.4 + i * 0.15}` }}>
                <span className="ladder__tier">{tier}</span>
                <span className="ladder__bar" />
              </div>
            ))}
          </div>
        </section>

        {/* PRIVACY — structural, not a policy; the schema is the proof. */}
        <section id="privacy" className="band privacy">
          <div className="privacy__text">
            <p className="eyebrow">Built private</p>
            <h2 className="band__title">Your prompts never leave the machine</h2>
            <p className="band__lede privacy__lede">
              The appraiser runs <em>locally</em>. What crosses the wire is the object on the
              right — counts and a numeric score. There is no prompt-text or source-code column
              anywhere in the backend. It isn't a policy you have to trust; it's a column that
              doesn't exist.
            </p>
          </div>
          {/* Condensed verbatim from convex/schema.ts — if the schema changes, change this. */}
          <pre className="codecard" aria-label="The schema: everything the server learns">
            <code>
              <span className="c-com">{"// convex/schema.ts — everything the server\n// ever learns about your sessions\n"}</span>
              <span className="c-kw">const</span> stats = <span className="c-fn">v.object</span>({"{\n"}
              {"  "}tokensFed: <span className="c-fn">v.number</span>(),{"\n"}
              {"  "}promptQualitySum: <span className="c-fn">v.number</span>(),{"\n"}
              {"  "}promptCount: <span className="c-fn">v.number</span>(),{"\n"}
              {"  "}survivalStreakDays: <span className="c-fn">v.number</span>(),{"\n"}
              {"  "}zoneAchievements: <span className="c-fn">v.number</span>(),{"\n"}
              {"}"});{"\n"}
              <span className="c-hot">{"// no prompt text. no source code.\n// not omitted — never modeled."}</span>
            </code>
          </pre>
        </section>

        {/* FINAL CTA */}
        <section className="band finale">
          <h2 className="finale__title">Give your sessions somewhere to live.</h2>
          <p className="finale__lede">Sign in, run two commands, then forget it's there.</p>
          <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
            Sign in to start
          </button>
        </section>
      </main>

      <footer className="home-footer">
        <span className="wordmark wordmark--sm">
          <span className="wordmark__glyph" aria-hidden>✥</span> Agent Idle
        </span>
        <span className="home-footer__note">An ambient idle game for people who ship code.</span>
      </footer>

      {authOpen ? (
        <div className="auth-overlay" onClick={() => setAuthOpen(false)}>
          <div className="auth-overlay__inner" onClick={(e) => e.stopPropagation()}>
            <AuthCard onClose={() => setAuthOpen(false)} cliLogin={cliLogin} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
