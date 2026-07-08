/**
 * The browser landing page — pitched at developers who already run Claude Code or Codex (and
 * the page `agent-idle login` opens). It LEADS with the single setup command (`npx @agent-idle/cli
 * setup` registers the hook AND signs you in) and FOLLOWS with the real game running live in the
 * browser (LiveDiorama — the actual renderer, not a recording). The rest earns trust: a
 * plain-language pipeline, the real game rooms, the gear ladder, and privacy stated as a
 * guarantee. Everything on the page mirrors the real engine — no invented rooms or tiers.
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
    name: "One command, then gone",
    blurb: "A single setup command, then it lives on a spare monitor. Nothing to grind, no daily quest, no notifications — you just keep coding.",
  },
  {
    name: "Every machine, one hero",
    blurb: "Laptop, desktop, the server you SSH into — they all level the same hero. Your progress follows you, not a single computer.",
  },
  {
    name: "Claude Code & Codex",
    blurb: "Both agents speak the same hook events, so one install covers your whole setup. More agents as they ship hooks.",
  },
];

/** The new onboarding: setup does everything (agent pick + hook + sign-in), then you keep coding. */
const STEPS = [
  {
    cmd: "npx @agent-idle/cli setup",
    title: "One command does it all",
    blurb: "Pick Claude Code or Codex, register the hook, and sign in — all in one go. It opens your browser once to link the machine; no tokens to copy.",
  },
  {
    cmd: "…keep coding",
    title: "Watch it come alive",
    blurb: "The daemon auto-starts on your next turn — nothing to launch by hand. Your hero shows up and your tokens start climbing.",
  },
];

/** The management commands, shown as a quiet reference under the steps. */
const MANAGE = [
  { cmd: "npx @agent-idle/cli status", note: "health check — daemon, sign-in, hooks, live sessions" },
  { cmd: "npx @agent-idle/cli remove", note: "uninstall the hooks and sign out" },
  { cmd: "npx @agent-idle/cli kill", note: "stop the sensor daemon" },
];

/** The diorama rooms, straight from the engine's real zones (mine/lumber/pond/camp/rest). Each
 * tool category sends a hero to its room; reading, searching AND web all fish at the pond.
 * Colours mirror the in-game palette (theme.css --act-*). */
const ROOMS = [
  { name: "The Mine", action: "Bash & test runs", blurb: "Shell commands swing a pickaxe for ore.", color: "var(--act-shell)" },
  { name: "The Lumber Yard", action: "Edit & Write", blurb: "Every applied diff fells a tree.", color: "var(--act-edit)" },
  { name: "The Pond", action: "Read, Grep & web", blurb: "Reading, searching, and web fetches all cast a line at the water.", color: "var(--act-read)" },
  { name: "The Camp", action: "Between turns", blurb: "Idle sessions gather at the campfire and rest up.", color: "var(--act-idle)" },
  { name: "The Graveyard", action: "Long-idle sessions", blurb: "Leave a session untouched too long and it faints here — revived the instant you use it again.", color: "#9a93a6" },
];

/** The pipeline in plain language — what happens between your keystroke and the hero moving. */
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
        <a className="wordmark" href="#top" aria-label="Agent Idle — home">
          <img className="wordmark__logo" src="/icon-512.png" alt="" aria-hidden width={32} height={32} />
          <span className="wordmark__text">Agent&nbsp;Idle</span>
        </a>
        <nav className="home-nav" aria-label="Sections">
          <a href="#demo">Live demo</a>
          <a href="#start">Get started</a>
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <button type="button" className="btn btn--gold home-header__cta" onClick={openAuth}>
          Sign in
        </button>
      </header>

      <main id="top">
        {/* HERO — lead with the one command, then the real game running live. */}
        <section className="hero">
          <p className="eyebrow eyebrow--center">An idle game for people who ship code</p>
          <h1 className="hero__title">
            Ship code. <span className="hero__title-accent">Level up.</span>
          </h1>
          <p className="hero__lede">
            Every Claude Code and Codex session you run mines tokens in an ambient world on a spare
            monitor. The more you ship, the more your hero levels up and gears up — one command to
            set up, then it runs itself and never slows a turn.
          </p>

          {/* LEAD: the single command. */}
          <pre className="hero__command" aria-label="Terminal: set up Agent Idle">
            <code>
              <span className="hero__command-prompt">$</span> npx @agent-idle/cli setup{"\n"}
              <span className="hero__command-out">→ pick Claude Code or Codex · hook registered</span>{"\n"}
              <span className="hero__command-out">→ browser opens once · this machine linked</span>{"\n"}
              <span className="hero__command-ok"># signed in — every session you ship now levels you up</span>
            </code>
          </pre>

          <div className="hero__cta">
            <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
              Sign in to start
            </button>
            <a className="btn btn--ghost btn--lg" href="#start">How it works</a>
          </div>

          {/* FOLLOW: the real game, live (not a recording). */}
          <figure className="hero__demo" id="demo">
            <div className="hero__stage-frame">
              <span className="hero__live">Live</span>
              <LiveDiorama />
            </div>
            <figcaption className="hero__stage-caption">
              The real game, running right now in your browser — the same renderer the app ships,
              with heroes mining as their sessions work. Not a recording.
            </figcaption>
          </figure>
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

        {/* GET STARTED — now a single command. */}
        <section id="start" className="band start">
          <p className="eyebrow eyebrow--center">Get started</p>
          <h2 className="band__title">One command. 30 seconds.</h2>
          <p className="band__lede">No wrapper, no proxy, no IDE plugin — it rides the hook interface your agent already exposes.</p>
          <ol className="steps steps--duo">
            {STEPS.map((s, i) => (
              <li className="step" key={s.title}>
                <span className="step__num" aria-hidden>{i + 1}</span>
                <code className="step__cmd">{s.cmd}</code>
                <h3 className="step__title">{s.title}</h3>
                <p className="step__blurb">{s.blurb}</p>
              </li>
            ))}
          </ol>
          <div className="manage" aria-label="Management commands">
            <span className="manage__label">Manage it anytime</span>
            <ul className="manage__list">
              {MANAGE.map((m) => (
                <li className="manage__item" key={m.cmd}>
                  <code>{m.cmd}</code>
                  <span className="manage__note">{m.note}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="start__cta">
            <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
              Sign in to start
            </button>
          </div>
        </section>

        {/* HOW IT WORKS — the pipeline in plain language, end to end. */}
        <section id="how" className="band how">
          <p className="eyebrow eyebrow--center">How it works</p>
          <h2 className="band__title">From keystroke to level-up</h2>
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
            Your hero stands wherever its session is working. When your agent switches from editing
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
              Lifetime tokens are the only currency. They buy armor, legs, helms, weapons, and an
              aura for your hero — five visual tiers per slot, recoloured again on every prestige
              loop — plus an unbounded prestige level above your name. There is nothing to grind,
              no daily quest, no notification. You just keep coding.
            </p>
          </div>
          <div className="ladder" aria-hidden>
            {["Bronze", "Iron", "Steel", "Mithril", "Prismatic"].map((tier, i) => (
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
          <p className="finale__lede">Sign in, run one command, then forget it's there.</p>
          <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
            Sign in to start
          </button>
        </section>
      </main>

      <footer className="home-footer">
        <span className="wordmark wordmark--sm">
          <img className="wordmark__logo" src="/icon-512.png" alt="" aria-hidden width={24} height={24} /> Agent Idle
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
