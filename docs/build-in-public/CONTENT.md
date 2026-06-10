# Building in Public — Agent Idle (née Promptmon)

Posts reconstructed by walking the git history (`f455317` → `790457d`,
**June 3 → June 10, 2026** — seven days). Visuals in `./shots/`.

> **The pitch:** Agent Idle is a tiny pixel creature that lives on your second monitor
> and *is* your Claude Code session. When Claude runs a command, it mines. When it edits
> a file, it's at the forge. When Claude needs you, a "?" pops over its head. When a turn
> errors, it gets knocked out. Good prompts feed it; lazy ones leave it Confused. Ship
> consistently and it earns visible armor and a spot on a leaderboard you can't fake.

---

## The better story — three ways to tell it

### Telling #1: "I made my coding assistant into a pet" (the hook)
Most AI tooling is a text box. I wanted a *companion* — something on the second monitor
that reacts to the actual shape of my work. So I wired Claude Code's hooks to a little
creature:

- Claude runs a shell command → the pet **mines** at a boulder.
- Claude edits a file → it's at the **forge** (sawmill, chopping).
- Claude is gathering/reading → it's in the **grove**.
- Claude is waiting on me for a permission → a **"!" bubble**; idle wait → a **"?" bubble**.
- A turn ends in an error → the pet is **knocked out** (and gets back up next turn).
- The session ends → it **faints**.

It's not a progress bar. It's a 16×16 mirror of your Tuesday.

### Telling #2: "the hard part wasn't the pet, it was making it *honest*" (the engineering)
A pet you can lie to is worthless — especially once there's a leaderboard. Three
decisions, all made in week one, exist to make cheating structurally hard and privacy
non-negotiable:

1. **One pure engine, three runtimes.** `packages/engine` is a headless reducer with no
   DOM, no Node, no network — and **CI fails the build if anyone imports one**. The
   *same math* runs in the Convex backend, the CLI daemon, and the app, so a creature
   behaves identically on every machine. (Commit 1, day 1: the purity check shipped
   before the features.)
2. **The server is the only writer.** Clients never write totals. They emit events; the
   server dedups by id, appends to an immutable ledger, and reduces it. Your score is
   derived from facts, not asserted by your client.
3. **Privacy is structural, not a policy.** Your prompt is appraised *locally*. The only
   thing that ever leaves your machine is a single coarse `quality` number — there is no
   column anywhere that could hold prompt text or source code. By design, even I can't
   see what you typed.

### Telling #3: "there is no tick" (the nerd-snipe)
Nothing polls your pet. Liveness is pure math over elapsed time, computed at read:
`lively → weary → drained → fainted → dead → gone`, each rung a time threshold past your
last bit of real work. Your pet can faint while the server sleeps, and the answer is
still correct the instant you look. ("Lazy decay.") A session-end event short-circuits it
— collapses energy to empty so the creature faints *now* instead of slow-fading.

---

## The journey, in beats (what actually shipped, by commit)

**Day 1 — June 3: the whole skeleton, plus the guardrails, in one day.**
- `f455317` first commit → `73e155e` the vision doc ("Promptmon")
- `5992cea` pnpm workspace **+ the engine-purity check wired into CI from commit one**
- `5ef70ab` auth (GitHub OAuth + password)
- `371fd65` first real pivot: **fullness → energy** (a number you top up → a life with a rhythm)
- `c522470` the sensor learns **Codex** as well as Claude Code

**June 6 — the pet gets a soul.** `a958bea` drag/move, species armor, labels, and a
`work-work.wav` ding when a turn finishes.

**June 8 — it becomes a place.**
- `5e2084b` ambient diorama zones + worker/armoured bodies
- `25d4249` a **dev asset gallery** (`?gallery`, 1,100 lines) — see the whole game on one screen
- `5922b3e` count **cache-inclusive tokens per turn** (measure real work, honestly)
- `1320cd4` work-driven zones, spawn-walk, grounded floors — pets stop floating

**June 10 — a full live vertical slice.** Engine gains live transient state
(`da56580`: action rooms, ?/! attention, knockout, session-end), Convex ingests the new
signals (`d1bb6d7`), the CLI sensor emits them (`a48906b`: tool category only — never tool
input), and the app renders the diorama world with status bubbles (`790457d`).

The arc, in a week: **vision → pure engine → server authority → local sensor → a creature
→ a living world.**

---

# READY-TO-POST CONTENT

## A) The launch thread (X / Twitter)

**1 — hook** · _img: `shots/02-hero-mining.png`_
> I turned my Claude Code session into a pet.
>
> When Claude runs a command, this little guy mines. When it edits a file, he's at the
> forge. When Claude needs me, a "?" pops over his head. When a turn errors, he gets
> knocked out.
>
> Building it in public 🧵

**2 — the origin** · _img: `shots/01-origin-idea.png`_
> Anthropic shipped a terminal pet, pulled it, and the community revived it.
>
> The pet was never the moat. The *world around it* is: earned armor, one creature across
> laptop + phone, and a leaderboard that means something. This was the whole vision on day 1 👇

**3 — the core loop**
> Your prompts are the food, and quality matters.
>
> A prompt with context + an example = a gourmet meal. A lazy "make it pop" = junk food
> that leaves your pet **Confused**. Food tiers: gourmet / balanced / snack / junk.
> Recognition humor as a game mechanic.

**4 — the world** · _img: `shots/03-zones.png`_
> Every zone is a real thing devs do, rendered as a place. The scene tells you what each
> session is doing at a glance — mining (shell), the sawmill (edits), the grove
> (reading), the campfire (idle), a bare stone floor (fainted).
>
> No labels needed. You just *know*.

**5 — the craft** · _img: `shots/04-creature-animations.png`_
> Week 1 and the worker already has a full action set — idle, run, mine, collect, slice,
> pierce, fish, water, carry, death.
>
> And a gallery tool to see every frame at once. If you can't see your assets, you can't
> ship a world. Built the lens before the level.

**6 — the honest-engine flex**
> The fun constraint: ONE pure engine powers three runtimes — server, CLI daemon, app —
> running the exact same math. CI fails the build the instant that engine touches the DOM,
> Node, or the network.
>
> A leaderboard is worthless if your client can write its own score. So it can't.

**7 — privacy + where it's going** · _img: `shots/05-world-scene.png`_
> Your prompts never leave your machine. They're scored locally; only a single number
> travels. There's literally no field that could store your code.
>
> North star: Promptmon Island — Bug Hell, the Merge Conflict Coliseum, the Meeting Mire.
> Follow along 🌱

---

## B) Standalone tweets

**The reframe** · _`shots/02-hero-mining.png`_
> It's not a progress bar. It's a 16×16 mirror of your Tuesday. When Claude runs a shell
> command, the pet swings a pickaxe at a boulder. I can tell what my agent is doing from
> the corner of my eye.

**The pivot**
> Killed my first design decision on day 1: "hunger" → "energy."
> Hunger = a number you top up. Energy = a life with a rhythm. Same bar, completely
> different creature. Words are architecture.

**No-tick flex**
> There's no background job watching your pet. Liveness is pure math over elapsed time,
> read on demand: lively → weary → drained → fainted → dead → gone. It can faint while the
> server's asleep and still be right when you look. "Lazy decay."

**The knockout**
> Shipped my favorite detail today: when a Claude turn ends in an error, the pet gets
> knocked out — slumps over — and gets back up on the next turn. Your failures are visible,
> survivable, and a little funny. Exactly like real debugging.

**Honest metrics**
> Spent a whole commit making sure I count *cache-inclusive* tokens per turn.
> If status is going to be "earned," even the boring accounting has to be honest. No vanity
> numbers feeding the leaderboard.

**The gallery** · _`shots/04-creature-animations.png`_ or `06-asset-gallery-full.png`
> Built a tool to look at the game before building the game. Every body, every animation,
> every zone, every sound — one hot-reloading screen. Tooling is a feature.

**Trustworthy leaderboard**
> The decision that shaped my whole backend: clients NEVER write totals. They emit events;
> the server reduces an append-only ledger. A score you can assert isn't worth ranking. A
> score that's derived is.

**Privacy**
> Your prompts never leave your machine. They're appraised locally and only a single coarse
> quality score travels. There is no column, anywhere, that could hold prompt text or code.
> Privacy as architecture, not a privacy policy.

**The world** · _`shots/03-zones.png`_
> From "creatures floating on a transparent background" to an actual place in a few days.
> A mine, a sawmill, a grove, a campfire by the water. Each one is a dev activity you'd
> recognize instantly.

---

## B2) Stats & dashboard tweets (the receipts)

The ambient pet grows into a real stats dashboard. The headline metrics are
**tokens fed (all-time)**, **worked turns this month**, your **streak**, and an honest
**time breakdown by what Claude was doing** (shell / edit / read / web / thinking / idle).
No "lines of code" — it's not server-verifiable and it's a bad proxy for real work.

**The dashboard reveal** · _img: `shots/09-dashboard-overview.png`_
> The pet was the hook. This is the substance.
>
> Tokens fed all-time, worked turns this month, current streak, and where today's time
> actually went. Your coding, accounted for honestly — no vanity "lines of code."

**The contribution graph** · _img: `shots/10-dashboard-history.png`_
> Yes, it has a contribution graph — but for the work you do *with* an agent. A year of
> tokens fed, daily volume with a 7-day average, and a lifetime effort bar showing exactly
> where the hours went: shell, edit, read, web.

**Streaks** · _img: `shots/09-dashboard-overview.png`_
> The most motivating number isn't the biggest one — it's the streak. A day counts if you
> fed any tokens or logged any real work. Miss a day and it resets. My pet is basically a
> Duolingo owl that respects my git history.

**The effort breakdown** · _img: `shots/10-dashboard-history.png`_
> Every second of a session gets bucketed by what Claude was *doing*: shell, edit, read,
> web, thinking, idle. The bar is tinted to match the diorama rooms — so the dashboard and
> the pet tell the same story two different ways. shell→mine, edit→lumber, read→grove.

**The leaderboard** · _img: `shots/11-leaderboard.png`_
> A leaderboard you can't fake, because your client can't write the score — it emits events
> and the server reduces them. Today I'm #3, chasing context_lord's 142M. The grind is
> public and the grind is real.

**Why not lines of code**
> I had "lines authored" on the dashboard. Cut it today. You can't verify it server-side
> without seeing the code (which never leaves your machine — by design), and it rewards
> volume over thought. Tokens fed + worked turns + streak tell a truer story.

---

## C) LinkedIn / longer post

> **I turned my AI coding assistant into a pet — and spent week one making sure it can't lie.**
>
> Agent Idle is a small pixel creature that lives on your second monitor and mirrors your
> Claude Code session in real time. When Claude runs a command, it mines. When it edits a
> file, it's at the forge. When Claude is waiting on you, a "?" pops over its head. When a
> turn errors, it gets knocked out — and gets back up on the next one. It's not a progress
> bar; it's a 16×16 mirror of your actual workday.
>
> The idea came from watching the dev community revive a terminal pet that Anthropic
> shipped and then pulled. The pet was never the point — the *world around it* is. Status
> you earn and can't fake. One creature that follows you from laptop to phone. A
> leaderboard that means something because it's tied to real output.
>
> Three decisions from week one, all there to make it honest:
>
> • **One pure engine, three runtimes.** The same headless reducer runs on the server, in
>   the CLI daemon, and in the app, so the creature behaves identically everywhere. CI
>   refuses to build if that engine ever touches the DOM, the filesystem, or the network.
>
> • **The server is the only writer.** Clients can't write their own totals — they emit
>   events and the server reduces an append-only ledger. If status is "earned," the
>   plumbing has to make cheating structurally hard.
>
> • **Privacy as architecture.** Your prompts are scored locally; only a single number
>   ever leaves your machine. There's no field anywhere that could store prompt text or
>   code — by design, I can't see what you typed.
>
> Even the food is honest: a prompt with context and an example is a gourmet meal; a lazy
> "make it pop" is junk food that leaves your pet Confused.
>
> North star: "Promptmon Island" — a map of a developer's actual life. Bug Hell, the Merge
> Conflict Coliseum, the Meeting Mire, Tutorial Hell. Recognition humor as a game, because
> every part of it is a Tuesday someone actually had.
>
> Shipping in the open. Follow along 🌱

---

## D) Pairing cheat-sheet

| # | File | Best for | Why it lands |
|---|---|---|---|
| 01 | `shots/01-origin-idea.png` | origin / vision tweet | whole pitch in one frame; "day 1" credibility |
| 02 | `shots/02-hero-mining.png` | the hook | the reframe made literal — a worker mining at a boulder |
| 03 | `shots/03-zones.png` | the world | dev activities → places; "you just know" |
| 04 | `shots/04-creature-animations.png` | craft | full action set; proves real, charming work |
| 05 | `shots/05-world-scene.png` | roadmap / north star | a tangible place; sets up the island |
| 06 | `shots/06-asset-gallery-full.png` | the "tooling is a feature" tweet | the whole game on one contact sheet |
| 07 | `shots/07-props-kit.png` | art-kit / "building the world" | grounds + props; shows the raw material |
| 08 | `shots/08-systems-tints-states.png` | systems / depth | per-pet tints + the liveness-state ladder |
| 09 | `shots/09-dashboard-overview.png` | the dashboard reveal / streaks | tokens, **worked turns this month**, streak, today's breakdown |
| 10 | `shots/10-dashboard-history.png` | contribution graph / effort | heatmap + daily tokens + **shell/edit/read effort bar** |
| 11 | `shots/11-leaderboard.png` | the leaderboard | you mid-pack, chasing #1 — "can't fake it" |

> All eleven are real captures of the current build. The dashboard shots use the dev `?dash`
> route with synthetic data (`dashboard/DashboardPreview.tsx`). Repro + how to grab
> *historical* shots: `HOW_THE_SHOTS_WERE_MADE.md`.
