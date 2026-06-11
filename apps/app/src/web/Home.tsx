/**
 * The browser landing page — pitched at developers who already run Claude Code or Codex (and
 * the page `agent-idle login` opens). It leads with what Agent Idle *is* and why you'd run it,
 * shows the two-command setup, then earns trust with a plain-language pipeline, the game world,
 * and a privacy stance stated as a guarantee (not a schema dump). The live game runs in the
 * hero (LiveDiorama) so the pitch proves itself.
 */

import { Fragment, useEffect, useState } from "react";
import { LiveDiorama } from "./LiveDiorama";
import { AuthCard } from "./AuthCard";

/** Why a developer keeps it running — benefits, not internals. */
const FEATURES = [
  {
    name: "Zero added latency",
    blurb: "It rides the hooks your agent already fires and hands the event off in milliseconds. Your turns never wait on it.",
  },
  {
    name: "Set it and forget it",
    blurb: "Two commands once, then it lives on a spare monitor. Nothing to grind, no daily quest, no notifications — you just keep coding.",
  },
  {
    name: "Every machine, one creature",
    blurb: "Laptop, desktop, the server you SSH into — they all feed the same pet. Your progress follows you, not a single computer.",
  },
  {
    name: "Claude Code & Codex",
    blurb: "Both agents speak the same hook events, so one install covers your whole setup. More agents as they ship hooks.",
  },
];

/** Two commands, then it disappears into the background. The explicit "how to use it". */
const STEPS = [
  { cmd: "agent-idle setup", title: "Install the hook", blurb: "Registers a hook in your agent's settings. It fires on every event and exits instantly." },
  { cmd: "agent-idle login", title: "Link this machine", blurb: "Opens your browser once to connect the machine to your account. No tokens to copy." },
  { cmd: "…keep coding", title: "Watch it come alive", blurb: "The daemon auto-starts on your first turn. Your creature shows up and starts mining tokens." },
];

/** The diorama rooms, straight from the game's ZONE_INFO — each agent tool sends a pet to its
 * own room. Colours mirror the in-game palette (theme.css --act-*). */
const ROOMS = [
  { name: "The Mine", action: "Bash & test runs", blurb: "Shell commands swing a pickaxe for ore.", color: "var(--act-shell)" },
  { name: "The Lumber Yard", action: "Edit & Write", blurb: "Every applied diff is a felled tree.", color: "var(--act-edit)" },
  { name: "The Grove", action: "Read & Grep", blurb: "File reads and searches forage the underbrush.", color: "var(--act-read)" },
  { name: "The Pond", action: "WebFetch & Search", blurb: "Web requests cast a line out over the water.", color: "var(--act-web)" },
  { name: "The Camp", action: "Between turns", blurb: "Idle sessions gather at the fire and rest up.", color: "var(--act-idle)" },
];

/** The pipeline in plain language — what happens between your keystroke and the creature moving. */
const PIPELINE = [
  { name: "your agent", color: "var(--parch)", lines: ["Claude Code or Codex", "untouched — fires a hook each step"] },
  { name: "the hook", color: "var(--gold)", lines: ["catches the event", "hands it off, never blocks a turn"] },
  { name: "the daemon", color: "var(--moss)", lines: ["scores your work on-device", "queues it up, survives restarts"] },
  { name: "the world", color: "var(--act-web)", lines: ["tallies your tokens", "the diorama updates live"] },
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
          <a href="#why">Why</a>
          <a href="#start">Get started</a>
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <button type="button" className="btn btn--gold home-header__cta" onClick={openAuth}>
          Sign in
        </button>
      </header>

      <main id="top">
        {/* HERO — what it is, in one breath, with the game running live beside it. */}
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">An idle game for people who ship code</p>
            <h1 className="hero__title">
              Your coding agent, <span className="hero__title-accent">as a pixel creature.</span>
            </h1>
            <p className="hero__lede">
              Agent Idle turns every Claude Code and Codex session into a little creature mining
              tokens in an ambient world on a spare monitor. Two commands to set up, then it runs
              itself — and adds zero latency to your turns.
            </p>
            <div className="hero__cta">
              <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
                Sign in to start
              </button>
              <a className="btn btn--ghost btn--lg" href="#start">See how it works</a>
            </div>
            <pre className="terminal" aria-label="Terminal: connect your machine">
              <code>
                <span className="terminal__prompt">$</span> agent-idle setup{"\n"}
                <span className="terminal__out">→ hook registered · fires on every turn</span>{"\n"}
                <span className="terminal__prompt">$</span> agent-idle login{"\n"}
                <span className="terminal__out">→ opens your browser · links this machine</span>{"\n"}
                <span className="terminal__out"># that's it — your creature shows up and starts mining</span>
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

        {/* WHY — the benefits a developer actually cares about. */}
        <section id="why" className="band why">
          <p className="eyebrow eyebrow--center">Why run it</p>
          <h2 className="band__title">Ambient by design</h2>
          <p className="band__lede">
            It sits in your agent's hot path, so it's built to be invisible until you glance over —
            then it's a tiny world rewarding every session you run.
          </p>
          <div className="features">
            {FEATURES.map((f) => (
              <article className="feature" key={f.name}>
                <h3 className="feature__name">{f.name}</h3>
                <p className="feature__blurb">{f.blurb}</p>
              </article>
            ))}
          </div>
        </section>

        {/* GET STARTED — the explicit how-to, two commands and you're done. */}
        <section id="start" className="band start">
          <p className="eyebrow eyebrow--center">Get started</p>
          <h2 className="band__title">Up and running in 30 seconds</h2>
          <p className="band__lede">No wrapper, no proxy, no IDE plugin — it rides the hook interface your agent already exposes.</p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li className="step" key={s.title}>
                <span className="step__num" aria-hidden>{i + 1}</span>
                <code className="step__cmd">{s.cmd}</code>
                <h3 className="step__title">{s.title}</h3>
                <p className="step__blurb">{s.blurb}</p>
              </li>
            ))}
          </ol>
          <div className="start__cta">
            <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
              Sign in to start
            </button>
          </div>
        </section>

        {/* HOW IT WORKS — the pipeline in plain language, end to end. */}
        <section id="how" className="band how">
          <p className="eyebrow eyebrow--center">How it works</p>
          <h2 className="band__title">From keystroke to creature</h2>
          <p className="band__lede">
            Everything between your agent firing a hook and the world moving — no part of it
            touches your prompts or slows you down.
          </p>
          <div className="pipeline" role="list" aria-label="Event pipeline">
            {PIPELINE.map((node, i) => (
              <Fragment key={node.name}>
                {i > 0 ? <div className="pipe-link" aria-hidden><span className="pipe-link__line" /></div> : null}
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

        {/* PRIVACY — stated as a guarantee, not a schema. */}
        <section id="privacy" className="band privacy">
          <div className="privacy__text">
            <p className="eyebrow">Built private</p>
            <h2 className="band__title">Your prompts never leave the machine</h2>
            <p className="band__lede privacy__lede">
              The appraiser runs <em>locally</em>. Your prompts and source code are scored on your
              own machine — only the numbers below ever cross the wire. It isn't a policy you have
              to trust; there's simply no column in the backend that could hold them.
            </p>
          </div>
          <div className="privacy__cols" aria-hidden>
            <div className="privacy__col privacy__col--out">
              <span className="privacy__label">Leaves your machine</span>
              <ul>
                <li>token counts</li>
                <li>a numeric quality score</li>
                <li>survival streak &amp; achievements</li>
              </ul>
            </div>
            <div className="privacy__col privacy__col--never">
              <span className="privacy__label">Never leaves</span>
              <ul>
                <li>prompt text</li>
                <li>source code</li>
                <li>file names &amp; paths</li>
              </ul>
            </div>
          </div>
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
