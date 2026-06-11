/**
 * The browser landing page — pitched at developers who already run Claude Code or Codex (and
 * the page `agent-idle login` opens). The hero pairs terminal-first copy with the real game
 * running live (LiveDiorama); the rest walks the actual pipeline (hook → daemon → reducer),
 * the engineering guarantees, the world, and the privacy stance, then asks for sign-in.
 *
 * Every technical claim here is checked against the code it describes: the hook contract
 * (cli/hook.ts), the outbox (cli/outbox.ts), lazy decay (engine/decay), and the scoring flag
 * (engine config.ts SCORING.includePromptQualityInScore). Keep them in sync.
 */

import { useEffect, useState } from "react";
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

/** The pipeline, end to end — each step is the real component doing the work. */
const STEPS = [
  {
    n: "01",
    title: "A hook fires",
    body: <>On every agent event — SessionStart, PreToolUse, Stop — Claude Code runs <code>agent-idle hook</code>. It POSTs the payload to a loopback daemon and exits 0. Your turn is never blocked.</>,
  },
  {
    n: "02",
    title: "The daemon appraises locally",
    body: <>It auto-starts on the first event, scores your prompt on your machine, reads token counts from the transcript, and queues to a durable on-disk outbox.</>,
  },
  {
    n: "03",
    title: "The server reduces",
    body: <>Events ship with idempotent IDs into an append-only ledger; one pure reducer derives all state. Every machine on your account stays consistent.</>,
  },
];

/** Engineering guarantees — the section a developer skims to decide whether this is a toy. */
const FACTS = [
  {
    title: "Zero added latency",
    body: <>The hook is fire-and-forget: read stdin, POST to loopback, exit 0. All real work happens async in the daemon, so your agent never waits.</>,
  },
  {
    title: "Offline-safe by design",
    body: <>A durable outbox (<code>~/.agent-idle/outbox.jsonl</code>) retries until delivery, and idempotent event IDs make redelivery harmless.</>,
  },
  {
    title: "No tick, no polling",
    body: <>Pet liveness is derived lazily from elapsed time at read. Nothing runs on a timer; nothing burns CPU while you're not looking.</>,
  },
  {
    title: "One pure engine",
    body: <>The same headless TypeScript reducer runs in the daemon, the browser, and on the server — and the server is the only writer of canonical state.</>,
  },
  {
    title: "Claude Code & Codex",
    body: <>Same hook events, same stdin JSON — one daemon serves both. <code>agent-idle setup</code> registers Claude Code; <code>setup codex</code> covers Codex.</>,
  },
  {
    title: "Un-gameable leaderboard",
    body: <>Rank counts only server-recomputable signals. Locally computed prompt quality feeds your pet's mood — never your competitive score.</>,
  },
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
              <a className="btn btn--ghost btn--lg" href="#how">Read the pipeline</a>
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

        {/* HOW IT WORKS — the actual pipeline, hook to reducer. */}
        <section id="how" className="band how">
          <p className="eyebrow eyebrow--center">The pipeline</p>
          <h2 className="band__title">Hook → daemon → reducer</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li className="step" key={s.n}>
                <span className="step__n">{s.n}</span>
                <h3 className="step__title">{s.title}</h3>
                <p className="step__body">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* UNDER THE HOOD — the guarantees that make it a tool, not a toy. */}
        <section id="engineering" className="band engineering">
          <p className="eyebrow eyebrow--center">Under the hood</p>
          <h2 className="band__title">Built like a tool, not a toy</h2>
          <p className="band__lede">
            It sits in your agent's hot path, so it's engineered like anything else you'd let
            in there.
          </p>
          <div className="facts">
            {FACTS.map((f) => (
              <article className="fact" key={f.title}>
                <h3 className="fact__title">{f.title}</h3>
                <p className="fact__body">{f.body}</p>
              </article>
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

        {/* PRIVACY — structural, not a policy. */}
        <section id="privacy" className="band privacy">
          <p className="eyebrow eyebrow--center">Built private</p>
          <h2 className="band__title">Your prompts never leave the machine</h2>
          <p className="band__lede privacy__lede">
            The prompt appraiser runs <em>locally</em>. Only a numeric quality score and event
            counts cross the wire — no table anywhere in the backend has a column for prompt
            text or source code. It isn't a setting you have to trust; it's a field that
            doesn't exist.
          </p>
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
