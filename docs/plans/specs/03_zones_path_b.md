# Promptmon — Zones (Path B)

The island is a map of a developer's actual life. Every zone is a real thing devs do,
rendered as a place — because the joke that makes people share this is *recognition*:
"oh god, that's my Tuesday." The zones double as the share-card hooks ("survived the
On-Call Watchtower 7 nights straight").

## How zones plug into the engine

Zones are just **data** on top of the pure engine — entities, resources, a tick. They
don't change the core; they add resources and assignments. The shared currencies:

- **Tokens (₸)** — money. Most zones produce or consume it.
- **Burnout** — rises with grind in "labor" zones (PPTemple-style). Too high → your
  workers complain, then strike. The cost of everything.
- **Tech Debt** — a creeping systemic resource (see the Swamp) that the whole map sinks
  into if you cut corners.
- **Knowledge / XP** — slow permanent growth.
- **Stability** — the health of "prod." Low stability spawns incidents.
- **Subagents** — your worker creatures (Grepzard, Lintbug, Docuduck, Testerpus,
  Refactopher, Hallucinox) get assigned to zones they're suited for.

**Zone types:** ⚔️ Grind (reward + risk) · 🔥 Labor (burnout) · 🌙 Hazard (it pings
*you*) · ☕ Downtime (flavor) · 🕸️ Systemic (affects the whole map).

---

## The flagship five (yours, fleshed out)

### 🔥 Bug Hell
*Real life: debugging.* A fiery dungeon lit by red CRT glow, bugs scuttling as little
demons. Each bug's HP equals the length of its stack trace. Descend through layers —
off-by-one imps, race-condition wraiths, the legendary **"Works On My Machine"** boss
who is genuinely invincible *on your machine* and must be fought on someone else's.
**Heisenbugs** only spawn when you look away from the screen. Clears raise Stability;
**Lintbug** thrives here. *Flavor: one "bug" turns out to be a feature in a trench coat.*

### ⚔️ Planning Playground
*Real life: sprint planning, grooming, estimation.* A bright playground where the swings
are Jira tickets and the jungle gym is a Kanban board. The minigame is estimation —
guess the story points — except **estimates are always wrong by design**, and "scope
creep" grows as weeds you have to keep pulling. The boss is **The Stakeholder**, who
changes the brief the instant you finish. Produces Roadmaps that decay as priorities
shift. *NPC: a Scrum Master ghost who only asks "is this blocked?"*

### ☕ Architecture Spa
*Real life: system design.* A serene zen spa — marble, soft ambient hum, whiteboards as
reflecting pools. Deeply relaxing. The **Microservices Massage** feels amazing and quietly
fills your Tech Debt meter; the spa water *is* tech debt. Every decision here buys
short-term calm and long-term pain. Produces design-pattern cosmetics and "clean
architecture" buffs that are a beautiful lie. *NPC: the Architect, who answers every
question with "it depends" and a knowing sip of tea.*

### 🌌 Coding Matrix
*Real life: flow state, actually writing code.* Green rain on black; your creature can
suddenly *see the code*. This is the **flow zone** — enter `in_the_zone` and your token/
line output multiplies; it's where you grind the stats that earn armor. But **any
interruption ejects you** and snaps the streak: a Slack-ping gremlin, a "quick question"
goblin, a calendar invite. Protect the flow. *Hazard: the gremlin's question is never
quick.*

### 🪦 Post-Mortem Graveyard
*Real life: incident retros.* A foggy graveyard of tombstones engraved with dead features
and outages — *"RIP prod, 14:32–15:09, killed by a missing semicolon."* After an
incident you hold a **blameless ritual** that grants permanent "lessons learned" buffs
and stops that bug from respawning in Bug Hell. Skip your post-mortems and the old bugs
**resurrect**. *NPC: the Gravekeeper, who swears it's blameless, then quietly reads the
git blame aloud.*

---

## More zones (the rest of the dev day)

### 🔥 Merge Conflict Coliseum
*Real life: rebasing & merge conflicts.* A gladiator arena over a chasm of tangled
branches. You battle `<<<<<<< HEAD` monsters by hand. **Rebasing** is the high-risk
finishing move — glorious when it lands, but a fumbled force-push wipes the day's work.
Boss: the **Detached HEAD**, who doesn't know where he is. Reward: a clean-history trophy.

### ⚔️ The Pipeline (Deployment Falls)
*Real life: CI/CD, builds, deploys.* A Mario-pipe waterworks running a river of green
checkmarks and red X's. Ship code down the pipe; **flaky tests** fail at random and pass
on retry, mocking you. A red build halts the whole island until someone fixes it. The
**"Deploy on Friday"** gate is sealed for a reason. *Hazard: rollback rapids.*

### 🌙 On-Call Watchtower
*Real life: incident response / paging.* A lonely tower at night with a brass bell. This
is the cruelest Tamagotchi mechanic on purpose: **random night alerts** can wake your
creature off-hours. Answer fast for Hero rep (and Burnout); ignore it and wake to a fresh
tombstone in the Graveyard. *NPC: PagerDuty, rendered as a relentless 3 AM rooster.*

### ☕ The Compile Dojo
*Real life: waiting for the build.* A dojo where devs sword-fight to pass the time while
things compile (yes, the xkcd one). Pure downtime — your creature duels for fun while a
long task runs. *Flavor: the progress bar that has been at 99% for eleven minutes.*

### 🔥 Dependency Dungeon (the node_modules Abyss)
*Real life: package management.* A bottomless pit heavier than a neutron star. Spelunk for
packages — some treasure, some **supply-chain traps** (a left-pad cave-in can collapse the
zone). Version conflicts are locked doors. Boss: a **CVE Wraith** that appears the night
before your release. Reward: a lean, clean lockfile.

### 🕳️ Tutorial Hell
*Real life: learning new tech.* An Escher staircase of "build a todo app" tutorials you
can't escape. Grinds Knowledge, but it's a trap — you loop forever scaffolding todo apps
instead of building the real thing. Escape requires the **"just build something" courage
buff**. *Flavor: you now know 9 frameworks and have shipped none.*

### 🛠️ The Naming Forge
*Real life: the two hard problems.* A forge where you must name variables under pressure.
Watch your creation evolve: `data` → `data2` → `dataFinal` → `dataFinalV2_USE_THIS`.
Adjacent: the **Cache Caverns**, where stale data haunts you and invalidation puzzles never
quite resolve. *Plaque on the wall: "There are only two hard problems..."*

### 🐎 Refactor Ranch
*Real life: refactoring.* **Refactopher** herds wild spaghetti code into tidy modules.
Converts Tech Debt into clean code (and drains the Swamp). The risk is **over-refactoring**
— he sometimes rewrites a module nobody asked him to touch, on a Friday. *The community is
split on whether that's a bug or a feature.*

### 🔭 The Observability Observatory
*Real life: logging, monitoring, dashboards.* A hilltop observatory with telescopes aimed
at Grafana constellations. Build dashboards to spot anomalies before they become incidents.
**"No logs" = a Flying Blind debuff** in Bug Hell. *NPC: an astronomer who's been staring
at a flat line for six hours, certain it'll spike any moment.*

### 🏔️ Stack Overflow Oracle
*Real life: searching for answers.* An ancient oracle on a shrine of accepted answers. Ask
your question; the Oracle answers a *slightly different* question, marks yours as a
duplicate, and closes it. The **Copy-Paste Relics** here grant instant power but may carry
a curse — a subtle bug from a 2013 thread. *Grepzard loves it here.*

### 🫧 The Meeting Mire
*Real life: standups & meetings.* A swamp that eats your afternoon. Long meetings drain
hunger and tokens in real time; the **"this could've been an email"** debuff is common.
Stealth mechanic: the mute button. Boss: the meeting that runs fifteen minutes over.
*NPC: someone confidently presenting on mute.*

### 🏟️ The Whiteboard Arena
*Real life: coding interviews.* A colosseum where you invert a binary tree under
fluorescent lights to prove you can center a div at work. Leetcode trials with no
connection to the actual job. *Flavor: "we don't use this day-to-day, but..."*

### 📚 Documentation Library
*Real life: docs nobody reads.* Hushed, dusty, beautiful. Slow Knowledge grind; **Docuduck**
lives here writing pages that will never be opened, and **Madam Markdown** shushes you for
typing in caps. *The only zone where it's always quiet.*

### 🌶️ Hackathon Hot Springs
*Real life: hackathons & crunch.* A frantic 48-hour pop-up festival. Time-boxed bursts pay
huge rewards for massive Burnout; at the end the **Demo Gods** decide whether your thing
works on stage in front of everyone. *Flavor: it worked five minutes ago.*

---

## 🕸️ The systemic layer: the Tech Debt Swamp

Underneath the whole island sits a swamp. Everything you skip — the Spa's shortcuts, the
refactors you postpone, the tests you didn't write — **sinks here and the water rises over
time.** If it floods, every zone slows down. You drain it at the Refactor Ranch and by
writing the docs and tests you've been avoiding. It's the resource that ties the map
together and the reason "just ship it" has consequences three zones away.

---

## Rapid-fire bonus seeds (even more real dev life)

Each of these is a one-line zone waiting to be drawn:

- **The YAML Labyrinth** — config & env setup; one wrong indent and the walls shift.
- **Database Migration Mines** — irreversible tunnels; `DROP TABLE` is a real cave-in.
- **The Rubber Duck Pond** — explain your bug to a duck; it solves it by listening.
- **Imposter Syndrome Cave** — a mirror maze; the monsters are just you, but better-rested.
- **The Cron Catacombs** — scheduled jobs that fire at 4 AM for reasons lost to history.
- **Regex Ravine** — a canyon you can only cross with an incantation you'll never re-read.
- **Onboarding Wilderness** — dropped into a 400k-line codebase with a README from 2019.
- **The Open-Source Commons** — contribute for glory; maintainers haven't slept since 2021.
- **Pair Programming Parlor** — two devs, one keyboard, infinite opinions.
- **The Deprecation Cemetery** — where features go when product says "sunset it."
- **Caffeine Springs** — the fuel depot; restores hunger, spikes jitter, no real sleep.
- **The Standup Stones** — a daily circle; "yesterday I... today I'll... I'm blocked by..."

---

## Why this works for our customer

Developers are the core audience, and recognition humor is the moat. None of these are
generic "fantasy zones" — every one is a Tuesday someone actually had. That's what makes
the share card land in a dev Discord: it's not a game about a wizard, it's a game about
*them*. Keep the satire sharp and specific; the more painfully accurate, the more it spreads.
