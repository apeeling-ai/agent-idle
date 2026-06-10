/**
 * The browser landing page — what a developer sees at the app URL before signing in (and the
 * page `agent-idle login` opens). The hero is the real game running live (LiveDiorama); the rest
 * explains the loop, the rooms, the progression, and the privacy stance, then asks for sign-in.
 */

import { useEffect, useState } from "react";
import { LiveDiorama } from "./LiveDiorama";
import { AuthCard } from "./AuthCard";

/** The diorama rooms, straight from the game's ZONE_INFO — each agent action sends a pet to its
 * own room. Colours mirror the in-game palette (theme.css --act-*). */
const ROOMS = [
  { name: "The Mine", action: "Shell commands", blurb: "Running commands swings a pickaxe for ore.", color: "var(--act-shell)" },
  { name: "The Lumber Yard", action: "Writing code", blurb: "Edits chop wood — every diff is a felled tree.", color: "var(--act-edit)" },
  { name: "The Grove", action: "Reading files", blurb: "Searching and reading forages the underbrush.", color: "var(--act-read)" },
  { name: "The Pond", action: "Browsing the web", blurb: "Web fetches cast a line out over the water.", color: "var(--act-web)" },
  { name: "The Camp", action: "Between turns", blurb: "Idle pets gather at the fire and rest up.", color: "var(--act-idle)" },
];

const STEPS = [
  { n: "01", title: "Install & connect", body: "Run agent-idle login once. The CLI links this machine to your account through your browser." },
  { n: "02", title: "Code with your agent", body: "Every Claude or Codex session spawns a creature. Its hook reports activity — never your prompts or code." },
  { n: "03", title: "Watch it grow", body: "Pets mine tokens while you ship. Lifetime tokens unlock gear and prestige, on a desktop you can ignore." },
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
          <a href="#world">The world</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <button type="button" className="btn btn--gold home-header__cta" onClick={openAuth}>
          Sign in
        </button>
      </header>

      <main id="top">
        {/* HERO — the thesis: your sessions, alive. */}
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Idle game × Claude &amp; Codex</p>
            <h1 className="hero__title">
              Your coding agents, <span className="hero__title-accent">come to life.</span>
            </h1>
            <p className="hero__lede">
              Agent Idle turns every coding-agent session — Claude or Codex — into a little pixel
              creature that mines tokens in an ambient world on your desktop. The more you ship, the
              more your world grows — quietly, in the corner of a second monitor.
            </p>
            <div className="hero__cta">
              <button type="button" className="btn btn--gold btn--lg" onClick={openAuth}>
                Sign in to start
              </button>
              <a className="btn btn--ghost btn--lg" href="#how">See how it works</a>
            </div>
            <pre className="terminal" aria-label="Terminal: connect your machine">
              <code>
                <span className="terminal__prompt">$</span> agent-idle login{"\n"}
                <span className="terminal__out">→ opens this page · connects your machine</span>{"\n"}
                <span className="terminal__prompt">$</span> agent-idle daemon{"\n"}
                <span className="terminal__out">→ watching for Claude &amp; Codex sessions…</span>
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

        {/* HOW IT WORKS — a genuine three-step sequence, so numbering earns its place. */}
        <section id="how" className="band how">
          <p className="eyebrow eyebrow--center">The loop</p>
          <h2 className="band__title">Three steps, then forget about it</h2>
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

        {/* THE WORLD — the rooms, drawn from the real game zones. */}
        <section id="world" className="band world">
          <p className="eyebrow eyebrow--center">The world</p>
          <h2 className="band__title">Every tool is a room</h2>
          <p className="band__lede">
            A pet stands wherever its session is working. Switch from editing to running tests and
            you'll see it walk from the lumber yard to the mine.
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
              Lifetime tokens are the only currency. They unlock armor, helms, and weapons for your
              hero — bronze through prismatic — and an unbounded prestige level that rides above your
              name. Nothing to grind. You just keep coding.
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

        {/* PRIVACY — the quiet differentiator devs actually care about. */}
        <section id="privacy" className="band privacy">
          <p className="eyebrow eyebrow--center">Built private</p>
          <h2 className="band__title">Your prompts never leave the machine</h2>
          <p className="band__lede privacy__lede">
            The sensor appraises your work <em>locally</em>. Only a numeric score and counts ever
            cross the wire — there isn't a column for prompt text or source code anywhere in the
            backend. It's structural, not a setting you have to trust.
          </p>
        </section>

        {/* FINAL CTA */}
        <section className="band finale">
          <h2 className="finale__title">Give your sessions somewhere to live.</h2>
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
