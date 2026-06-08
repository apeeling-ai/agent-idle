# Promptmon — Technical Build Spec

**What this document is:** how to build it. Architecture, stack, data and event
models, the scoring/unlock/anti-cheat implementation, the build phases, and the
engineering rules that keep it cheap to extend. The companion document, **Product &
Plan**, covers the *what* and *why*; this one assumes those are settled and gets
concrete. Primary reader: Thijmen (the build), with the client/cosmetic surfaces
shared.

---

## 0. The non-negotiables (read first)

Three rules. Break any and a later phase becomes a rewrite.

1. **The game is a pure engine.** `packages/engine` is plain TypeScript with no
   browser API, no Node API, no `fetch`. If it stays pure it runs unchanged on a
   phone. Enforce with a CI lint rule that bans those imports in the package.
2. **The server is the only thing allowed to be right.** Clients never report
   totals; they report *timestamped events*. The server computes every score,
   unlock, and rank itself. This single rule is what makes the leaderboard credible.
3. **Cosmetics are layers, not redraws.** The renderer composites `base species +
   armor + headgear + aura + status` as separate z-ordered layers. Adding the
   Legendary set is adding art + a row, never touching the base sprite.

---

## 1. System shape

Five layers, each replaceable without touching the others.

| Layer | What it is | Runs where | Why it matters |
|---|---|---|---|
| **Engine** | Pure TS: entities, resources, ticks, prompt-appraisal, scoring, unlock rules. | Everywhere (shared package) | Reused as-is on phone; identical math everywhere |
| **Renderer** | Canvas world; layered sprite compositor; input. | Desktop + phone | Web-based so one renderer serves both |
| **Sensors** | Detect Claude usage, emit signed events. | Desktop only | Phone reads results; never senses |
| **Backend** | Authoritative state, scoring, unlocks, leaderboards, identity. | Cloud service | The leaderboard + the cross-device truth |
| **Identity** | GitHub OAuth. | Backend | Avatar skin, verified name, anti-cheat anchor |

```
  Claude Code ──hook──┐
  claude.ai  ──ext───┤            ┌────── desktop window (Tauri) ──┐
                     ├─ events ─▶ │  BACKEND   │ ◀── phone app (Capacitor)
  your-own-API ──────┘  (signed)  │ scores +   │
                                  │ unlocks +  │ ──▶ LEADERBOARDS (public, opt-in)
                                  │ ledger     │
                                  └────────────┘
```

---

## 2. Stack (decisions, not options)

- **TypeScript everywhere** — the engine is literally the same code on every target.
- **Monorepo:** pnpm workspaces; shared `engine` imported by every app.
- **Desktop shell: Tauri** — frameless, transparent, always-on-top window (the
  classic desktop-pet pattern) in a light native shell that renders web, so the
  same renderer runs on the phone.
- **Renderer: HTML5 Canvas** for the pixel world + React for surrounding UI.
- **Mobile shell: Capacitor** (default) wraps the same web UI into iOS/Android.
  *Alt:* React Native for a more native feel — same engine either way.
- **Backend: Hono on Node** — REST for state/leaderboards, WebSocket for live
  "pet ate" / "rank changed" pushes.
- **Storage: SQLite** locally (offline cache + Phases 1–2) → **Postgres** in cloud,
  same schema. An append-only **event ledger** table is the heart of anti-cheat.
- **Identity: GitHub OAuth** — also the avatar source and the one-account anchor.

---

## 3. Repository layout

```
promptmon/
├── packages/
│   ├── engine/                 # PURE logic. No DOM, no Node, no fetch.
│   │   ├── src/
│   │   │   ├── entities.ts      # species, newEntity, tick, feed
│   │   │   ├── resources.ts     # hunger; later tokens/ore/burnout
│   │   │   ├── zones.ts         # empty in A; Mine/Exchange/PPTemple in B
│   │   │   ├── events.ts        # event model (§5)
│   │   │   ├── scoring.ts       # Trainer Score formula (§7) — shared math
│   │   │   ├── unlocks.ts       # stat threshold → cosmetic rules (§8)
│   │   │   └── index.ts
│   │   └── (tests beside source)
│   └── renderer/               # Canvas + layered compositor. Imports engine.
│       └── src/
│           ├── sprites/         # base species art
│           ├── cosmetics/       # armor / headgear / aura art, by layer
│           ├── compositor.ts    # z-ordered layer stack → canvas
│           ├── sharecard.ts     # renders the flex card image (viral loop)
│           ├── world.ts         # scene + frame loop
│           └── input.ts         # tap/click → engine events
├── apps/
│   ├── desktop/                # Tauri shell; local backend in Phases 1–2
│   ├── mobile/                 # Capacitor shell; same renderer (Phase 5)
│   └── server/                 # Hono: ledger, scoring, unlocks, boards (Phase 4)
├── sensors/
│   ├── claude-code-hook/       # signs + posts usage events (Phase 3)
│   └── browser-extension/      # claude.ai sensor (Phase 7, optional)
└── package.json                # pnpm workspace root
```

---

## 4. Data model

Generic on purpose: the pet is the first entity; hunger the first resource; the
Mine/Temple are just more zones; armor is just owned cosmetics.

```
Entity
  id          string           # "buddy"; later "grepzard", "monk_03"
  species     string
  name        string           # LLM-generated "soul", set once
  resources   map<string,num>  # { hunger } → later { hunger, tokens, ... }
  cosmetics   { owned: id[], equipped: { body?, head?, aura? } }
  status      string | null    # in_the_zone | confused | striking
  alive       boolean
  lastTick    timestamp

Account
  id            string         # internal
  githubLogin   string         # "karpathy" — display + avatar source
  visibility    "public" | "friends" | "private"   # leaderboard opt-in (default private)
  verified      boolean        # §9
  seasonStats   map<string,num># reset each season
  lifetimeStats map<string,num># never reset (tokensFed, linesAuthored, streak...)

EventLedger  (append-only — the anti-cheat backbone)
  id, accountId, type, source, payload, at, hmacValid: bool, accepted: bool

Save
  ownerId, entities[], zones[], updatedAt   # updatedAt = last-write-wins sync key
```

`lifetimeStats` / `seasonStats` are **never written by clients** — they're derived
by reducing the EventLedger (rule #2). There is **no prompt-text or source-code
column anywhere**, by design (privacy promise, §10).

---

## 5. Event model — passive + active feed one loop

Two event sources, one engine.

```
Event
  type     "feed" | "pet" | "delegate" | "claude_used" | "code_authored"
  source   "user_tap" | "claude_code_hook" | "browser" | "api"
  payload  { promptQuality?, tokens?, linesAdded?, zoneId? }
  at       timestamp
  sig      HMAC(account secret, body)   # sensors sign; local taps don't need to
```

- Tap the pet → `{ feed, user_tap }`.
- Claude Code prompt (hook) → `{ claude_used, claude_code_hook, {tokens, promptQuality} }`.
- Claude Code edit (hook) → `{ code_authored, claude_code_hook, {linesAdded} }`.

Every event hits `engine.apply(event)` **locally** for instant feedback **and**
posts to the backend ledger for scoring. The engine doesn't care about `source`,
which is exactly why on-screen buttons and real-usage sensors never conflict, and
why a taps-only phone is a full citizen.

**Prompt quality** is graded in `engine/scoring.ts` (shared) so client and server
score identically: vague vibes → junk food + Confused + low weight; context + an
example → gourmet + full feed + full weight.

---

## 6. Sensors — how "reacts to real Claude usage" works

By surface, honestly:

- **Claude Code — easy, official.** Hooks fire on lifecycle events:
  `UserPromptSubmit` (you sent a prompt) and `PostToolUse` (after an edit; receives
  the file path, can count added lines). Configure in `~/.claude/settings.json`,
  pointing at a small signed poster. **Primary score source + the v1 demo.**
- **claude.ai browser — medium.** A small extension detects a sent message and pings
  localhost. Phase 7.
- **Claude desktop app — hard, skip early.** No official hook to observe chats.
- **Your own API usage — trivial.** You control the calls; emit events directly.

Phones never sense — they read the creature the laptop fed. That cross-device read
is why the backend exists, and it's the same backend the leaderboard runs on.

The hook signs each event with a per-account secret (HMAC) so randoms can't POST to
someone else's account. The poster batches and retries; it sends counts + a coarse
quality score, **never prompt text**.

---

## 7. Scoring — the Trainer Score

Computed server-side from the ledger:

```
TrainerScore =
    w1 * tokensFed            # real usage volume
  + w2 * linesAuthored        # the deliberate vanity flex (LOC is a joke metric — that's the point)
  + w3 * avgPromptQuality     # rewards GOOD prompting, not just heavy use
  + w4 * survivalStreakDays   # rewards consistency (Tamagotchi soul)
  + w5 * zoneAchievements     # Path B: mine hauls, temple campaigns, boss kills
```

Weights live in one config so a whole season can be re-tuned without code changes.
The quality and streak terms are what stop the board from being "who generated the
most slop." The same formula runs in `engine/scoring.ts` (for instant local
preview) and on the server (the authoritative value).

---

## 8. Unlocks & the cosmetic compositor

**Tier ladder** (thresholds tunable; starting points):

| Tier | Unlock (lines authored / tokens fed) | Look |
|---|---|---|
| Cloth | start | plain |
| Bronze | 1k / 100k | light trim |
| Iron | 10k / 1M | full plate |
| Steel | 50k / 10M | etched plate + cape |
| Mythril | 250k / 100M | glowing trim |
| **Context Lord** | 1M / 1B | full set + animated aura |

Plus non-grind cosmetics: streak crowns, zone trophies (Path B), seasonal
exclusives.

**Implementation:** each cosmetic is an art asset + a row `{ layer, zIndex,
unlockRule }`. `engine/unlocks.ts` holds the rules; the server validates every
equip against verified stats (you can't wear what the ledger didn't earn).
`renderer/compositor.ts` stacks `base → body → head → aura → status` z-ordered onto
the canvas. The **same compositor** renders the live creature, the leaderboard
avatar, and the share card — build it once, in Phase 1, even with a single sprite.

---

## 9. Leaderboards & anti-cheat (the hard part)

**Identity.** GitHub OAuth; one board identity per GitHub account; display name +
avatar from GitHub.

**Server-authoritative.** Clients send signed, timestamped events to the append-only
ledger; the server reduces them into stats and scores. Recomputable, auditable.

**Anti-cheat, in honest tiers:**

1. *Signed events* — per-account HMAC; randoms can't POST to your account.
2. *Rate sanity* — server caps plausible ingestion (tokens/min, lines/min). Bursts
   beyond human+Claude throughput are rejected or flagged.
3. *Anomaly flags + shadow handling* — suspicious accounts quietly held out of
   public boards pending review, not hard-banned.
4. **The honest ceiling.** Someone controlling their own machine can fake their own
   usage; no third party can fully verify Anthropic usage today. So the board splits:
   - **Open tier** — anyone; fun; clearly labeled "mostly honest."
   - **Verified tier** — checkmark via stronger proof (manual review for notable
     accounts now; signed first-party usage later *if* it ever exists). The one that
     "means something."

**Scopes:** global, by language, by org/team, friends-only; plus weekly/seasonal
boards (reset `seasonStats`) so newcomers can win short-term.

**Aspirational targets:** seed clearly-fictional legendary NPC ghosts at the top.
Never fabricate or impersonate a real person's score.

---

## 10. Privacy, enforced in code

The product promises "records *that* you worked, never *what* you wrote." Enforce it
structurally, not by good intentions:

- **Local-first** through Phases 1–3; backend is `localhost` until cloud opt-in.
- **No prompt-text / source-code column exists** in any schema. Sensors send counts
  + a coarse quality score only.
- **Sync only game state** (hunger, mood, stats, cosmetics).
- **`visibility` defaults to private**; leaving a board purges the public row.

---

## 11. Build phases (with realistic estimates)

Happy-path vs realistic, in focused working days per dev. Realistic is the number to
plan against.

| Phase | Happy | Realistic | Friction |
|---|---|---|---|
| 0 — Engine | ½–1 d | 1–2 d | trustworthy test suite |
| 1 — Desktop window | 2–4 d | 4–7 d | Tauri transparency/always-on-top per OS |
| 2 — First cosmetics | 1–2 d | 2–4 d | clean layered compositor |
| 3 — Claude Code sensor | 1–2 d | 2–4 d | hook signing, live debugging |
| 4 — Backend + identity | 3–5 d | 6–10 d | OAuth, ledger, hosting, first ops |
| 5 — Mobile app | 4–7 d | 8–14 d | Capacitor bugs + app-store review |
| 6 — Leaderboards | 4–6 d | 7–12 d | anti-cheat never done in one pass |

**Phase detail (done-when criteria):**

- **0 — Engine.** Pure package: entities, resources, `tick()` decay, `feed()` +
  prompt appraisal, mood thresholds, scoring + unlock stubs. *Done:* tests show 10
  idle hrs → hungrier; gourmet fills + scores high; "make it pop" → Confused + low
  score. No UI.
- **1 — Desktop window.** Tauri frameless/transparent/always-on-top on a second
  monitor; Canvas renderer with the layered compositor from the start; click to
  feed/pet; local SQLite. *Done:* a clickable pet lives on the second screen and
  survives a restart. Standalone.
- **2 — First cosmetics.** Wire `unlocks.ts` + compositor to local stats. *Done:*
  fake "work" visibly dresses the creature (proves the art pipeline pre-server).
- **3 — Claude Code sensor.** Signed `claude_used` / `code_authored` hooks → local
  backend. *Done:* prompting in Claude Code feeds the pet and ticks unlock stats,
  live on the other monitor. **The demo.**
- **4 — Backend + identity.** Hono in cloud: append-only ledger, server-side
  scoring, GitHub OAuth, Postgres; desktop talks to it (SQLite as offline cache).
  *Done:* two instances on one account show the same creature + stats live. **Gate
  to mobile + leaderboards.**
- **5 — Mobile app.** Capacitor-wrap the renderer; read the same backend over the
  same WebSocket. *Done:* phone shows the pet fed by the laptop's Claude Code use in
  near-real-time; tap to feed from the couch.
- **6 — Leaderboards.** Boards (scopes + weekly/seasonal), opt-in visibility,
  rate-sanity + anomaly flags, Open/Verified tiers, NPC ghosts; armor on board
  avatars; the share card renders real rank data. *Done:* you and a friend see each
  other ranked with gear showing, and a spammer gets capped/flagged, not #1.

**Critical path** ≈ `0 → 4 → 6`, paced mostly by Thijmen. Mobile (5) and
leaderboards (6) both wait on the backend (4) — it's the chokepoint; don't let it
drift. The client-light and content work sits off this path on purpose.

**Phase 7 — Promptmon Island (ongoing, additive):** more species (rows); subagent
hunger (delegating = feeding); the Gold Mine (`tokens`/`ore` + a `mine` zone, The
Algorithm mini-boss); the Stock Exchange (`sentiment` minigame); the PPTemple
(`burnout` resource that *rises* with work → complaints → strike → union arc; "no
strike" = a trophy); idle accrual (extend `tick()` to grow resources offline); the
browser sensor. By the time you build the union mechanic, "strike" is a status and
"burnout" is a resource over a threshold — the engine never changed.

---

## 12. Engineering rules to hold the line

- **CI guard on engine purity** — fail the build if `packages/engine` imports a DOM,
  Node, or network API. This is what keeps the mobile app nearly free.
- **Tests before pixels** — Phase 0 ships headless and green before any rendering.
- **One compositor** — live creature, leaderboard avatar, and share card all render
  through `renderer/compositor.ts`. Never fork it.
- **Server recomputes everything** — never trust a client total; the ledger is the
  source of truth and scores must be re-derivable from it.
- **`updatedAt` everywhere now** — it does nothing in Phase 1 but is what makes
  cross-device sync sane in Phase 4. Don't add it late.

---

## 13. First technical move

Pair on **Phase 0**: the tested, pure engine with scoring + unlock stubs. Freeze the
data model (§4) and event model (§5) — every other track depends on those contracts.
The moment they're frozen, Thijmen starts the backend skeleton (Phase 4 groundwork)
against the agreed schema so it's ready when mobile and leaderboards need it, while
the desktop window and the share-card renderer can proceed in parallel off the
critical path.
