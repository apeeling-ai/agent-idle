# Agent 00 — Executive & Execution Runbook

> The missing layer. The Architect (Agent 01) owns *technical* contracts; Strategy
> (Agent 10) owns *business* direction. Neither owns **program execution** — resolving
> the blocking decisions, assigning the two humans, and sequencing day one so you can
> actually start. That's this document. Read it first thing tomorrow.

---

## 1. Verdict: do the ten plans belong together?

**Yes — the spine is coherent.** All ten share the three non-negotiables (pure engine,
server-authority, layered cosmetics), reference the same contracts, and the dependency
graph has no cycles. The values are consistent across docs (cosmetic-first ↔ no
pay-to-win ↔ credible board ↔ privacy invariant). Nothing contradicts.

**But the review found five real gaps** that would bite mid-build. They're resolved
below so they don't.

## 2. Gaps found in review, and the fix

1. **No execution owner.** There was an architect and a strategist but nobody owning
   the runbook, role split, and decision resolution. → *This document (Agent 00).*
2. **Anti-cheat ownership was double-claimed.** Networking (§Networking) and
   Leaderboards (§Leaderboards) both described rate-sanity. → **Resolution:**
   Leaderboards *defines* the caps and policy; the server/Networking layer *enforces*
   them on ingest. One definition, one enforcement point.
3. **No art-production owner — the #1 timeline risk.** Social owns *creative/voice* and
   Frontend owns the *compositor that consumes art*, but nobody owned *making the
   sprites*. → **Resolution:** assign art **direction** to the content owner (you),
   and **decide buy-vs-commission-vs-make in week 1** (default: buy 8-bit asset packs
   for the base creature + tiers, commission only the hero cosmetics). This is the
   single most likely thing to bottleneck; it gets an owner and a deadline now.
4. **No ops/hosting/cost owner.** The backend implies a server, Postgres, monitoring,
   and a bill. → **Resolution:** folds into Thijmen's backend track; cost stays near
   zero until cloud (Phase 4) — keep Phases 0–3 local. Add a one-line monthly cost
   ceiling before going cloud.
5. **No explicit legal/QA gate.** → **Resolution:** legal = a named task (D3 name
   clearance + a ToS read on usage data) gated *before public launch*, not before
   building. QA = the Architect's CI guardrails + the per-Ship go/no-go checklist (§5).

## 3. Locked default decisions (so nothing blocks "execute")

The Architect's open-decision register is hereby resolved to **working defaults**.
These are reversible, but they unblock building *now*. None of them block Phase 0.

| # | Decision | Locked default | Blocks what (if unresolved) |
|---|---|---|---|
| D1 | Failure state | **Faint-and-recover is the default; permanent death is an opt-in "Hardcore" mode.** (UX's recommendation.) Engine ships both behind `failureMode`. | Nothing — engine already supports both |
| D2 | Backend/ranking layer | **Build custom (Hono + Postgres). Spike Nakama vs Postgres ranked-queries at Phase 6**, not before. | Only Phase 6 (Leaderboards) |
| D3 | Name/brand | **"Promptmon" working title; trademark/clearance before public launch.** | Only the public landing page (Social) |
| D4 | Monetization | **Free. If ever: cosmetics + team-tier only. Never pay-to-win, never sell rank, never sell data.** | Nothing — principle is enough |
| D5 | Season length | **6–8 weeks; `seasonStats` reset, `lifetimeStats` never.** | Only Phase 6 tuning |

**Consequence: Phase 0 (the engine) is fully unblocked.** Everything needed to start
is decided.

## 4. Role assignment (you + Thijmen)

- **Thijmen → the critical-path build.** Architect (contracts), Engine, Networking,
  Backend, Leaderboards, ops/hosting. He owns `Engine → Server → Leaderboards`.
- **You → content, growth, light client, art direction.** Social, Strategy, UX
  *content*, the share card + landing page, and **art procurement** (the new owner).
  All off the critical path, so your pace never stalls his.
- **Shared:** the Phase 0 contract-freeze (pair on it), and the UX↔Frontend handoff
  for the share card.
- **Honest risk:** the critical path is almost entirely Thijmen. If he's blocked,
  the build is blocked — there's no second backend dev. Keep the contracts tight so
  the server is the *only* hard part.

## 5. The execution sequence + go/no-go gates

### Tomorrow (Day 1) — start here
1. **Pair-freeze the contracts** (15–30 min): confirm the engine types in the seed.
2. **Thijmen: paste the Phase 0 kickoff prompt into Claude Code** (provided with the
   seed). It scaffolds the TS monorepo, ports the seed engine, keeps tests green,
   and stops for review. **This is the "click execute."**
3. **You: kick off art procurement** (the week-1 buy-vs-commission decision) and start
   the worldbuilding bible.

### Ship 1 — desktop pet reacts to Claude Code + earns armor (Phases 0–3)
**Go/no-go to start Ship 2:** engine tests green; a clickable creature lives transparent
on the second monitor; prompting in Claude Code feeds it live; a threshold visibly
unlocks Bronze. *Also: capture the demo clip the moment this works.*

### Ship 2 — cross-device (Phases 4–5)
**Gate:** two clients on one account converge live; the phone shows the creature fed by
the laptop; offline loses/doubles nothing. *Cost ceiling agreed before cloud.*

### Ship 3 — public leaderboards + share card (Phase 6)
**Gate:** you and a friend ranked with gear showing; a spammer gets capped, not #1;
the share card renders real rank. **Legal gate (D3 clearance) cleared before this goes
public.**

### Later — Promptmon Island (Phase 7), purely additive.

## 6. What "click execute" actually means (honest)

Clicking execute tomorrow does **not** produce a finished game — that's months of
work, as the timelines say. What it *does* produce, immediately: a scaffolded
monorepo with a **pure, tested engine that passes green**, and Claude Code positioned
to build the next phase. You wake up, paste one prompt, watch the foundation build and
tests pass, and you are genuinely building — phase by phase, with a runnable thing at
every gate. That's real. "Whole game by morning" is not.

## 7. Definition of done (Executive)

Decisions locked (§3); gaps owned (§2); roles assigned (§4); Day-1 sequence + Ship
gates defined (§5); the Phase 0 seed runs green and the kickoff prompt exists. Then
the program is executable.
