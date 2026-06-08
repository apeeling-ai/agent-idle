# Promptmon — Product & Plan

**What this document is:** the idea, locked in. The vision, the scope, who does
what, when it ships, and the decisions to settle *before* writing code. This is the
doc you and Thijmen align on and point other people at. The companion document,
**Technical Build Spec**, covers *how* to build it; this one is the *what* and the
*why*.

---

## 1. The pitch (one paragraph)

Promptmon is an ambient, second-monitor Tamagotchi whose creature lives off your
**real Claude usage**. You can poke it directly — tap to feed it, pet it, send
little workers off to do jobs — and it also reacts on its own whenever you actually
use Claude: prompt in Claude Code and your creature eats on the other screen. The
better your prompts, the better it's fed. Keep shipping and your creature earns
**visible armor** anyone can see. There are **public leaderboards**, so when a great
engineer plays, you see their genuinely earned high score. It starts as one pet and
can grow into a whole little world.

## 2. Why it's worth building (and the honest competition)

The hook isn't novelty mechanics — it's **recognition humor plus earned status**.
Every developer who uses Claude sees themselves in a creature that gets fed by their
real work and dressed up by their real output. It's screenshottable, it's a flex,
and the leaderboard turns private satisfaction into public bragging.

Be clear-eyed about prior art:

- Anthropic already shipped a terminal Tamagotchi (`/buddy`) in Claude Code, then
  pulled it; the community resurrected it as a third-party MCP server. So "a pet in
  your terminal" is taken and is *not* our differentiator.
- **Our edge is everything `/buddy` isn't:** an ambient second-monitor *world* you
  interact with, a creature that earns *visible armor* from real output, *cross-
  device* presence (laptop + phone, one creature), and a *credible public
  leaderboard*. That stack doesn't exist.

If we ever feel like we're just rebuilding a terminal pet, we've lost the plot.

## 3. The experience (core loops)

**Two ways to feed one creature:**

- **Passive (the idle-game soul):** your real Claude usage feeds it automatically.
  You mostly *watch* it thrive as you work.
- **Active (the Tamagotchi soul):** you tap to feed, pet, and later assign workers
  to zones. This is what makes the phone a full citizen even though the phone can't
  sense your Claude usage.

**Prompt quality is food quality** — the central joke and the central mechanic. A
lazy "make it pop" is junk food that leaves the creature Confused; a thoughtful
prompt with context and an example is a gourmet meal. Good prompting literally
nourishes your creature and, later, lifts your rank.

**Neglect has teeth.** In true Tamagotchi tradition, ignore it long enough and it
suffers. The exact failure state is a decision to lock (see §9), but the emotional
pull — "I should go feed my guy" — is the point.

## 4. Status you can see — earned armor

Higher cumulative output dresses your creature in better gear, from plain Cloth up
to a glowing **Context Lord** set. The armor shows on the creature *and* on your
leaderboard avatar, so a legendary set is an instant "this person ships." Crucial
design stance: **cosmetic-first, not power-first.** Gear is visible respect, not a
stat advantage — otherwise the board becomes "who left Claude running longest." Two
extra tiers of pride: streak crowns (kept your creature alive N days) and, later,
zone trophies from the world (Path B).

## 5. The social layer — leaderboards done credibly

This is the viral engine, and it only works if people trust it.

- **You rank by a composite "Trainer Score,"** not raw volume — it rewards good
  prompting and consistency, not just who generated the most. (Lines-of-code is in
  there too, deliberately, as a tongue-in-cheek vanity number — everyone knows LOC
  is a joke metric, which fits the satirical tone.)
- **Many boards, not one wall:** global, by language, by org/team, friends-only,
  plus weekly/seasonal resets so a newcomer can win *this week* even if they'll
  never out-grind a veteran.
- **Two tiers of trust:** an *Open* board (fun, mostly-honest, clearly labeled) and
  a *Verified* board (the one that "means something").
- **The "see Karpathy at the top" dream — straight talk:** you cannot list a real
  person who hasn't chosen to play, and faking a score would poison the whole thing.
  The real path is better: make it good enough that great engineers opt in, give
  them a verified checkmark, and let their genuinely earned armor speak. For
  aspirational targets before real legends arrive, seed **clearly-fictional
  legendary NPCs** ("The Archmage of Autocomplete") as boss-tier ghosts to dethrone
  — flavor, impersonating no one.

## 6. The viral loop — the share/flex card

The single most important growth feature: a **screenshot-ready card** showing your
creature, its armor, and its rank, designed to be posted. This is what turns a
private toy into a thing that spreads. It should look great, read in a glance, and
be one tap to generate. Treat it as a launch-critical product feature, not a
nice-to-have — it's the mechanism by which anyone outside the project ever hears
about it.

## 7. Privacy & trust (a product promise, not just a setting)

The thing watches your work, so trust is the whole ballgame:

- **Local-first** until you choose to go online.
- **It records *that* you worked, never *what* you wrote** — no prompt text, no
  source code ever leaves your machine.
- **Leaderboard visibility is opt-in and revocable.**

If developers don't trust the sensor, nothing else matters. This promise is
load-bearing and the technical spec enforces it at the schema level.

## 8. Scope & ship points

The plan is deliberately stoppable. Each point is a real, shippable thing:

- **Ship 1 — Solo desktop pet that reacts to Claude Code and earns armor.** The
  "what is that on your second monitor?" moment. If we only ever ship this, it was
  worth it.
- **Ship 2 — Cross-device.** Real backend + phone app; one creature on laptop and
  pocket. The biggest engineering step up.
- **Ship 3 — Public leaderboards + the share card.** The social/viral layer goes
  live.
- **Later — Promptmon Island.** The full world: collectible worker creatures, the
  SEO Gold Mine, the Stock Exchange, and the burned-out PPTemple with its monk
  union arc. Pure upside, sequenced for after the core proves out.

## 9. Decisions to lock before building

Settle these now so they don't thrash later. **Proposed working defaults for every one
of these are already written up in Agent 00 (Executive) — see its open-decision
register; you and Thijmen only need to accept or change them.**

- **Name & brand.** "Promptmon" is a working title; check it's clear of trademark
  trouble before it's on a landing page.
- **Art approach.** Make it / commission it / buy 8-bit asset packs. This is the
  most likely thing to bottleneck the timeline — decide first.
- **The failure state.** Does a neglected creature faint-and-recover, or permanently
  die (hardcore Tamagotchi)? This shapes the whole emotional tone.
- **Platforms first.** Desktop-only for Ships 1–2, phone at Ship 2 — confirm.
- **Monetization (or not).** Free toy? Cosmetic-only purchases later? Decide the
  *principle* now (e.g. "never pay-to-win, never sell rank"), defer the mechanics.
- **Season length** and what resets.

## 10. Who does what

- **Thijmen — gifted backend dev + elite vibe coder → owns the build.** He drives
  the critical path: the engine, the backend, identity, the sensor, and the
  leaderboard/anti-cheat. The hardest, most load-bearing work sits with the strongest
  person — which is the best thing about this team setup.
- **You — vibe coder focused on social content → own content & growth + the light,
  social-facing surfaces.** For a toy that lives on being screenshotted into dev
  Discords, this is half the product, not a side role. Your two strengths converge
  on the highest-leverage pieces: the **share card**, the **landing page**, and all
  the **worldbuilding writing** (creature names, armor flavor, the PPTemple monks,
  the fictional leaderboard legends). Code-light, taste-heavy, growth-critical.

The neat part: your tracks sit *off* the technical critical path, so a slower
vibe-coding pace never stalls Thijmen — it just means content and polish land
alongside the build instead of scrambling after it.

## 11. Timeline (honest)

The technical pace is mostly **Thijmen-paced** (one strong dev on the critical path
plus a lighter second), so don't bank on a big two-person speed multiplier on the
hard code. The real win is that launch content is ready in parallel.

- **Both full-time:** the desktop demo (Ship 1) in **~2–3 weeks**; through public
  leaderboards (Ship 3) in **~5–8 weeks**.
- **Evenings & weekends (~10–12 hrs/week each):** Ship 1 in **~6–9 weeks**; through
  Ship 3 in **~3.5–6 months**.
- **The full world (Promptmon Island):** open-ended, months more.

Two timeline truths worth repeating: **art can move these numbers more than any code
phase**, and **app-store review adds calendar time you can't compress** once the
phone app is in play.

## 12. Content & growth plan (your track)

Runs in parallel from day one so it's ready when the build is:

- **The demo clip** — the "what is that on your second monitor" video/gif of the
  creature reacting to live Claude Code use. This is *the* marketing asset; capture
  it the moment Ship 1 works.
- **The share card** — spec and design it early (see §6); it's the loop.
- **The landing page** — simple, shows the demo clip, one-line pitch, waitlist.
- **The writing** — creature names, armor flavor text, NPC personalities, season
  themes, the satirical voice throughout.
- **Seeding** — where it launches (dev Discords, X/Twitter, the launch post), and
  the fictional-legend leaderboard ghosts that make an empty board feel alive.

## 13. Biggest risks

- **The leaderboard is only as good as its anti-cheat.** Spoofable numbers kill
  credibility; the build must be server-authoritative from the start.
- **The backend is the critical path and it's almost all Thijmen.** No second
  backend dev to absorb it if he gets buried — name this between you up front.
- **Art is the sleeper cost.** Decide the approach before it blocks you.
- **Trust.** One creepy-feeling data practice and developers bounce. Hold the privacy
  promise in §7 absolutely.
- **Scope creep toward "just a terminal pet."** If we drift there, we're competing
  with Anthropic's own (pulled, fan-revived) feature instead of our actual edge.
