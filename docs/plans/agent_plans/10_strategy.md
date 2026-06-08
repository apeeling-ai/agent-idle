# Agent 10 — Strategy & Monetization

> Greenfield. Frames every other plan: what "winning" means, whether/how it earns, and
> the values that protect the trust the whole thing runs on. **Open decision D4
> (monetization principle)** is owned here.

---

## 1. Mandate

Decide what success *is* for this project, set the single metric that proves it's
working, choose a monetization stance that never poisons trust, and keep scope honest
about the return on effort.

## 2. First, the honest framing

This is unlikely to be a primary income source, and pretending otherwise would warp
every other decision. The realistic, high-value returns are: **audience, credibility,
a portfolio piece developers love, and a hiring/visibility signal.** Treat revenue as
a possible bonus layered on top of that — not the goal that bends the design.

## 3. The success metric

Pick **one** north-star and aim everyone at it. Recommended: **number of opted-in
active creatures** (people who installed, connected the sensor, and keep their
creature alive). Not dollars, not raw signups — *living, opted-in creatures*, because
that's the thing that proves the core loop works and is the precondition for any later
revenue. Everything else (board activity, share-card posts) is a supporting metric.

## 4. Monetization options (honest about each)

- **Free + reputation play.** Ship free; the payoff is audience and credibility.
  Lowest risk, real value, no revenue. *Best default for launch.*
- **Cosmetic-only purchases.** Sell *looks* — seasonal sets, alt palettes, vanity
  auras — never power or rank. Acceptable to dev audiences *iff* it never touches
  board fairness. A modest, honest revenue line.
- **Pro / team tier.** Org leaderboards, team boards, private seasons, admin tooling —
  "your eng team competes." The most plausible *real* revenue, B2B-flavored, and it
  rides the leaderboard you're already building.
- **Sponsorship / brand seasons.** A season themed around a sponsor. Easy to overdo;
  guard the satirical tone or it reads as a sellout.

## 5. The hard "never" list (trust guardrails)

These are non-negotiable because crossing any one collapses the credibility the
leaderboard and the sensor depend on:
- **Never pay-to-win.** Money never improves score or rank (consistent with
  Progression's cosmetic-first rule).
- **Never sell rank.** No bought placement, ever.
- **Never sell or monetize the usage data.** The sensor's trust is the whole product;
  monetizing what it sees would destroy it — and likely carries ToS/legal risk around
  real Anthropic usage data.
- **No ads inside the experience.**

Monetization, if any, lives strictly on **cosmetics and team features** — never on the
usage signal.

## 6. The D4 decision (owned here)

Decide the **principle now**, defer the **mechanics**:
- Principle to ratify: *"Free to play; never pay-to-win, never sell rank, never sell
  data; revenue (if ever) only via cosmetics and team tiers."*
- Mechanics (prices, which cosmetics, team-tier features) wait until there's an
  audience to monetize — premature monetization design is wasted work.

## 7. Legal / risk posture

- **Name/brand (D3):** clear "Promptmon" (or the chosen name) before it's public —
  trademark and confusion risk.
- **Usage-data sensitivity:** anything touching real Anthropic usage has trust and
  possibly ToS implications; the privacy invariant (counts not content, local-first,
  opt-in) is also a *legal* shield, not just an ethical one.
- **Impersonation:** the no-fabricated-scores rule (Leaderboards) is also a
  reputational/legal guardrail.
- **Platform fees:** app stores take a cut and charge dev fees — factor into any
  cosmetic/team pricing later.

## 8. Sequencing strategy with the build

- **Ships 1–3 are free**, full stop — the job is to prove the loop and grow the
  opted-in-creature metric.
- **Only after** there's a living audience do you design the team tier (the most
  defensible revenue) and optional cosmetics.
- Never let monetization work block or distort the core build.

## 9. Interfaces & handoffs

- **Frames:** Product scope, Progression (no pay-to-win), Social (positioning + the
  funnel), Leaderboards (fairness as a product value).
- **Consumes:** Social's growth funnel; the team's appetite for B2B vs pure toy.
- **Produces:** the one-page stance (what it is, the principle, the north-star
  metric).

## 10. Risks

- **Monetizing too early** → distorts design, alienates the dev audience → defer
  mechanics (§6).
- **Trust collapse** from crossing a "never" → the guardrails (§5) are absolute.
- **Mistaking signups for success** → the north-star is *living opted-in creatures*.
- **Legal exposure** on data/name → clear D3, hold the privacy invariant.

## 11. Open decisions surfaced

- **D4** monetization principle (ratify the stance now).
- **D3** name/brand clearance (shared with Social).
- Pure toy vs B2B-team ambition — sets how much the team invests post-launch.

## 12. Definition of done

A one-page stance exists and is ratified: what the project *is*, the monetization
principle with its "never" list, and the single north-star metric everyone aims at —
with mechanics explicitly deferred until there's an audience.

## 13. First three tasks

1. Draft and ratify the one-page stance + the "never" list (resolves D4 principle).
2. Lock the north-star metric and hand it to Social as the funnel target.
3. Kick off D3 name/trademark clearance with Social.
