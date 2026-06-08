# Promptmon — Start Here

This is the complete, current document set for the project. Everything here is
consistent and reviewed; older drafts have been dropped (see the bottom note).

## Read in this order

1. **`promptmon_overview.html`** — open in a browser. The one-page project overview
   with the executive summary. Start here, and use it to show anyone else.
2. **`specs/01_product_and_plan.md`** — what we're making and why (the vision, scope,
   team, timeline, the decisions to lock).
3. **`specs/02_technical_build_spec.md`** — how it's built (architecture, stack, data
   + event models, anti-cheat, build phases).
4. **`specs/03_zones_path_b.md`** — the world: developer-life zones for the later
   "Promptmon Island" stage.
5. **`agent_plans/00_executive.md`** — the runbook: the locked-default decisions, the
   role split, and the day-one execution order. **Read this before building.**
6. **`agent_plans/01`–`10`** — one deep plan per discipline (architect, research,
   engine, networking, progression, leaderboards, UX, frontend, social, strategy).

## What it is, in one line

An ambient desktop pet for developers, fed by your real Claude usage, that earns
visible armor and ranks on a credible public leaderboard — starting as one creature
and growing into a small world of developer-life zones.

## Locked working defaults (accept or change with Thijmen)

These were resolved during review so building isn't blocked. Full detail in
`agent_plans/00_executive.md`.

| # | Decision | Default | Blocks the build? |
|---|---|---|---|
| — | Build approach | **Greenfield** — our own architecture (standard libraries, not a fork) | — |
| D1 | Failure state | Faint-and-recover; permanent death = opt-in "Hardcore" mode | No |
| D2 | Backend / ranking | Build custom (Hono + Postgres); spike the ranking layer at Phase 6 | No |
| D3 | Name / brand | "Promptmon" working title; clear trademark before public launch | Launch only |
| D4 | Monetization | Free; cosmetics/team-tier only if ever; never pay-to-win / sell rank / sell data | No |
| D5 | Season length | 6–8 weeks; season stats reset, lifetime never | No |

## Who owns what

- **Thijmen** → the critical-path build: engine → backend → leaderboards, plus
  networking, identity, and ops.
- **You** → content, growth, the share card + landing page, art direction, and UX
  content — all off the critical path.

## The build, in three ships

1. **Desktop pet** that reacts to Claude Code and earns armor (~2–3 wks full-time).
2. **Cross-device** — real backend + phone, one creature everywhere.
3. **Public leaderboards** + the one-tap share card. Then the wider world (Path B).

## Optional: the Phase 0 starter

`optional_phase0_seed/` contains a runnable, dependency-free engine with passing
tests, plus `CLAUDE_CODE_KICKOFF.md` — a single prompt to paste into Claude Code when
you decide to start. It's optional and ignorable; the planning docs above are the
deliverable. To run the tests: `cd optional_phase0_seed && node --test packages/engine`.

## Where we are

Planning is complete and coherent. The only thing left before building is a short
decision between you and Thijmen on the defaults above. Code starts on your machine,
when you choose.

---

*Dropped as superseded (in case you have older copies): the original combined build
plan (now split into specs 01 + 02), the combined specialist plans (now the eleven
agent plans), the old review page (now the overview), and the early MCP terminal-pet
scaffold (we went greenfield desktop instead).*
