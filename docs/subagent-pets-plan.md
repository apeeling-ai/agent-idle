# Subagent Pets — Implementation Plan

**Status:** Proposed (awaiting go-ahead to implement Phase 1)
**Author:** Jordi + Claude
**Date:** 2026-06-24
**Scope:** Render Claude Code subagents as little colour-matched "helper" pets around the
parent pet, joined by a glowing thread, that walk over to deliver their work (coins) and then
poof. Existing pets also walk their work to the player, then return to the campfire.

---

## 0. TL;DR

When an agent (a pet) spawns subagents, each subagent appears as a **mini pet at 50% size**,
the **same species and colour** as its parent, connected to the parent by a **soft glowing
campfire-coloured thread**. While alive it shows the **specific job** it is doing
(read/edit/shell/web). When it finishes, it **walks to its parent**, **drops coins** (the
existing coin sprite + cha-ching), and **poofs with a magical sparkle**. Separately, when a
normal pet finishes a turn it **walks to the player** ("main character"), **drops coins**, and
**returns to the campfire**.

The work is implemented as a **scale-aware hybrid**:

- **Ephemeral + local:** the little pets, thread, job animations, delivery walks, and poof are
  a live, on-machine visual layer driven by the daemon. They never hit the append-only ledger.
- **Persisted + global:** a subagent's token output is credited to the **parent** pet via a
  single ordinary activity event, so the work is real, durable, counts toward the parent's
  stats, and shows on every machine.

This requires **no change to the frozen engine contract** (`events.ts` / `entities.ts`) and
**no Convex schema change**, which is what keeps it safe at 10k+ concurrent users.

---

## 1. Goals & non-goals

### Goals
1. Visualise subagent fan-out in a way that is **fun and immediately legible** — you can see at
   a glance "this pet has 3 helpers working for it."
2. Helpers are **recognisably owned** by their parent (same colour + species, tethered).
3. A satisfying **delivery loop**: helpers bring work to the parent; pets bring work to the
   player; coins + cha-ching mark the hand-off.
4. **Tone:** helpers read as eager apprentices/sidekicks summoned from the same campfire magic
   — never as shackled labour. The thread is a glowing thread of light, not a chain/leash.
5. **Scales to 10k+ concurrent users** without amplifying backend writes.

### Non-goals
- Subagents are **not** persisted as first-class cross-machine entities (rejected on cost — see
  §9). Their *output* is persisted via the parent; their *presence* is a local visual.
- No prompt text, source code, tool input, or assistant messages ever leave the machine
  (privacy is structural — see §10).
- No changes to scoring/leaderboard semantics beyond the parent receiving its helpers' tokens
  (which already flows through the existing additive `tokensFed` stat).

---

## 2. Decision log (locked)

| # | Decision | Choice |
|---|----------|--------|
| D1 | How "real" are helpers? | **Scale-aware hybrid** — parent-credited stats persisted; helpers are local ephemeral visuals |
| D2 | Delivery hierarchy | **Two-tier** — subagents → parent pet; pets → player, then back to campfire |
| D3 | Connector visual | **Glowing magic thread** (campfire colour), gentle slack droop |
| D4 | Helper exit | **Magical poof / fade** after delivering |
| D5 | Crowd handling | **Render all** of them (no cap); watch performance |
| D6 | Delivery FX | **Reuse the existing coin sprite + cha-ching**; this *replaces* the current "coins fly to player on token increase" effect |
| D7 | Counting | Subagent tokens **count toward the parent's** stats |
| D8 | Helper appearance | **Same species as parent**, 50% size, parent's colour |

### Defaults chosen for unanswered sub-questions (easily revisited)
- **Thread shape:** gentle slack droop (catenary), subtle pulse. Tweak in Phase 4.
- **Helper labels:** helpers get **no** name label (reduces clutter on big fan-outs).
- **Poof:** short sparkle burst in the parent's colour, ~400ms, then remove.

---

## 3. Verified ground truth (empirical — Claude Code 2.1.181)

Captured live on this machine by temporarily logging raw `/hook` POST bodies in the daemon
while spawning real subagents (method recorded in memory `claude-subagent-hook-payloads`). The
plan rests on these facts, not on documentation guesses.

### `SubagentStart`
```
keys: session_id, transcript_path, cwd, agent_id, agent_type, hook_event_name, terminal
```
- `agent_id` — **unique per subagent** (e.g. `a09225e0e6db519d7`). Opaque; treat as a stable id.
- `agent_type` — e.g. `general-purpose`, `Explore`, or a custom agent name.
- `session_id` — the **parent** session id (subagents share the parent's session). So:
  **parent = `session_id`, helper = `agent_id`.**

### `SubagentStop`
```
keys: session_id, transcript_path, cwd, permission_mode, agent_id, agent_type, effort,
      hook_event_name, stop_hook_active, agent_transcript_path, last_assistant_message,
      background_tasks, session_crons, terminal
```
- Same `agent_id` as its `SubagentStart` → clean start↔stop correlation.
- **`agent_transcript_path`** — the subagent's **own** transcript
  (`…\<session>\subagents\agent-<agentId>.jsonl`). The daemon's existing `readTokenUsage()`
  reads token counts from it, exactly like it does for the main transcript at `Stop`.
- `last_assistant_message` — the helper's final text. **Privacy-sensitive — never forwarded.**

### Subagent tool events
- A subagent's **own** `PreToolUse` / `PostToolUse` **carry that subagent's `agent_id`**
  (verified: a Glob run inside a helper produced `PreToolUse{tool_name:"Glob", agent_id:"a09…"}`).
- Main-agent tool events do **not** carry `agent_id`.
- ⇒ We can attribute each tool call to the right helper and show its **specific job**, not just
  a generic "working" loop.

### Implications
- Concurrent subagents are fully distinguishable.
- Per-helper liveness window = `[SubagentStart, SubagentStop]`.
- Per-helper job = last tool category seen on a tool event carrying that `agent_id`.
- Per-helper token output = `readTokenUsage(agent_transcript_path)` at `SubagentStop`.

---

## 4. Current system (what we build on)

> File anchors are approximate (verify at edit time).

- **Engine contract (frozen):** `packages/engine/src/events.ts` — `Event = register | activity`,
  routed by `sessionId`; `packages/engine/src/entities.ts` — `Entity` keyed by `sessionId`, no
  hierarchy. **We will not change these.**
- **Daemon:** `apps/cli/src/daemon.ts` — loopback HTTP server on **port 47615**.
  - `handleHook(payload, agent)` (~305–449) switches on `hook_event_name`. Today
    `SubagentStart`/`SubagentStop` just **renew the parent's `working`** (~368, ~403); the
    helper identity is discarded.
  - `emit()` (~267) / `working()` (~297) enqueue events to the durable outbox; a flusher posts
    to Convex `events:ingestEvent`.
  - `readTokenUsage()` in `apps/cli/src/transcript.ts` reads token counts from a transcript.
  - Local read endpoints: `GET /token`, `GET /sessions` (per-session display hints the app
    joins by `sessionId`), `GET /subagents` *(new)*. CORS/origin rules at ~512–584.
- **Convex authority:** `convex/events.ts:ingestEvent` — authenticate → dedup by
  `clientEventId` → rate-check → append `eventLedger` → `decay`+`apply` → write derived state.
  `getPlayerState` returns `{ account, pets[], stats, … }` keyed per `sessionId`.
- **App render:**
  - `apps/app/src/App.tsx` (~558–584) maps Convex `pets` → `CreatureView[]`, computing
    `decay(entity, now)` and `tint: tintForSeed(pet.entity.id)` (~576).
  - `apps/app/src/PixiStage.tsx` — holds the `Creature[]`, pushes to the compositor, plays
    cues. **Active→idle** transition at ~292 (currently just plays `workDone`). **Coin fly**
    effect at ~323–358 (spawns a `Flyer` from a pet to the player on token increase; plays
    `coin`).
  - `apps/app/src/render/compositor.ts` — renderer-agnostic layer stack; `PALETTE`,
    `hashSeed`, `tintForSeed` (~26–46); `viewSignature` (~246).
  - `apps/app/src/render/renderer-pixi.ts` — the only Pixi file. Per-creature `Slot` with target
    scale `ts` eased by `SCALE_LERP`; `stepWalk()` (~279–319) hub-and-spoke mover; campfire
    sprite (`scene.camp`, ~359–370).
  - `apps/app/src/render/layout.ts` — `worldLayout()` (~155–190) deterministic positions;
    player home (~86, world ≈ (240,128)); camp cluster (~105, world ≈ (150,356)).
  - `apps/app/src/render/sound.ts` — `play("coin")` cha-ching synth (~128–146), `play("workDone")`.

---

## 5. Target architecture

```
Claude Code hooks ──► agent-idle hook ──► Daemon (port 47615)
                                           │
        ┌──────────────────────────────────┼───────────────────────────────────┐
        │ EPHEMERAL / LOCAL                 │ PERSISTED / GLOBAL                 │
        │                                   │                                   │
   liveHelpers: Map<parentSessionId,        │ on SubagentStop:                  │
     Map<agentId, HelperLive>>              │   tokens = readTokenUsage(         │
        │  ▲           ▲                     │             agent_transcript_path) │
        │  │SubagentStart/Stop              │   emit activity{sessionId: parent, │
        │  │+ subagent tool events          │     tokens} ──► outbox ──► Convex  │
        │  │(agent_id)                       │                 ingestEvent        │
        ▼  │                                 ▼                                   │
   GET /subagents (local-only) ◄── App      getPlayerState ◄── App (reactive)    │
        │                                   │                                   │
        └──────────────► App render ◄───────┘                                   │
                          (join helpers to parent pet by sessionId)             │
                                  │                                             │
                          mini pets + thread + errands + coins + poof           │
```

- The **only** new server traffic is **one activity event per `SubagentStop`** (parent token
  credit). Everything else is local.
- Helpers appear on the machine running them (where the ambient window + campfire live).

---

## 6. Detailed component design

### 6.1 Daemon — helper tracking + parent credit

**New in-memory state** (lives only as long as the daemon process):

```ts
type PetAction = "none" | "shell" | "edit" | "read" | "web"; // existing engine type

interface HelperLive {
  agentId: string;
  agentType: string;      // e.g. "general-purpose" | "Explore" | custom
  action: PetAction;      // last tool category attributed to this helper
  startedAt: number;      // epoch ms (SubagentStart)
}

// parentSessionId -> (agentId -> HelperLive)
const liveHelpers = new Map<string, Map<string, HelperLive>>();
```

**`handleHook` changes** (in the switch, ~305–449):

- `SubagentStart` — *(currently: renew parent working)*
  - Still renew the parent's `working` (so the parent keeps "mining" while delegating).
  - **Add** `liveHelpers[session_id].set(agent_id, { agentId, agentType, action:"none", startedAt: now })`.
- `PreToolUse` / `PostToolUse` **when `payload.agent_id` is present** (i.e. fired by a helper)
  - Map `tool_name → PetAction` via the **existing** tool→action map already used for the
    parent's job, and set `liveHelpers[session_id].get(agent_id).action`.
  - Do **not** forward these to Convex (local-only — this is the per-helper job animation).
- `SubagentStop`
  - `tokens = readTokenUsage(payload.agent_transcript_path)` (best-effort; 0 on failure).
  - `emit()` **one** `activity` event with `{ sessionId: session_id /* parent */, working:true,
    tokens }` — credits the parent's `tokensFed` through the normal additive path. (No
    `appraisal`, so prompt-quality average is untouched.)
  - Remove the helper: `liveHelpers[session_id].delete(agent_id)` (and delete the parent bucket
    if empty). The app detects the disappearance and plays the deliver→poof outro (it has the
    helper's last-known position; see §6.4).
  - Continue to renew the parent's `working` as today (a sub-agent finishing ≠ parent done).
- Existing `Stop` / `SessionEnd` for the **parent** session should also **clear** any lingering
  `liveHelpers[session_id]` (safety: if a SubagentStop is somehow missed, the helpers don't
  leak when the parent's turn/session ends).

**Scale guard (batching):** a huge fan-out can fire many `SubagentStop`s in a burst. To avoid
bursty outbox/Convex writes, **coalesce parent token credits**: accumulate per-parent token
deltas and flush at most once per `RENEW_MS`-style interval (or piggyback on the existing flush
tick) as a single `activity{tokens: Σ}` event. This bounds server writes to ~O(active parents),
not O(subagents). (Idempotent `clientEventId` keeps retries safe.)

**New endpoint** `GET /subagents` (mirror `/sessions` semantics: local-only, same
CORS/origin/host checks, no auth bearer exposure):

```jsonc
// response: parentSessionId -> array of live helpers (numeric/enum only — no text)
{
  "4f2a4733-…": [
    { "agentId": "acbbc9c6…", "agentType": "general-purpose", "action": "read", "startedAt": 1750… }
  ]
}
```

> Privacy: the payload carries only ids, the agent-type label, an enum action, and a timestamp.
> No prompt, no tool input, no `last_assistant_message`.

### 6.2 Engine — **no change**

The parent credit is an ordinary `activity` event with `tokens`. `apply()` already sums
`tokensFed` order-free. Helpers are never engine entities. `events.ts` / `entities.ts` stay
frozen. ✅

### 6.3 Convex — **no schema change**

- Subagent credit rides the **existing** `ingestEvent` path (one extra `activity` per parent per
  flush window). `eventLedger` + `entities` shapes unchanged.
- **Rate limits:** verify the per-account rate ceiling in `ingestEvent` tolerates the extra
  (coalesced) events. With batching this is ~1 extra event per parent per flush tick — well
  within budget. If needed, treat token-credit events under the same ceiling as normal activity
  (they already are).

### 6.4 App — render layer

**Helper CreatureViews** (in `App.tsx` alongside the pet mapping, ~558–584):

- Fetch `/subagents` from the daemon the same way the app already fetches `/sessions` (local
  bridge), keyed by parent `sessionId`. Keep it in React state, refreshed on the existing poll.
- For each parent pet rendered, for each live helper build a `CreatureView`:
  - `species` = **parent's** species.
  - `tint` = `tintForSeed(parentSessionId)` — seed from the **parent**, not the helper id, so
    the colour matches exactly (compositor change below).
  - `activity`/`action` = derived from the helper's `action` (job animation), `alive:true`,
    `working:true` while present.
  - `scale` target = **0.5** (renderer eases `ts`).
  - `key` = `helper:${parentSessionId}:${agentId}` (stable, distinct from pet keys).
- Helpers are appended to the `Creature[]` after pets. The player stays index 0.

**Colour inheritance** (`compositor.ts`): `tintForSeed` already exists; we just pass the parent
seed when building a helper view. Add a tiny helper `tintForParent(parentSessionId)` or pass the
seed explicitly so prestige recolours on the parent can later cascade if desired (out of scope
now).

**Layout** (`layout.ts`): place helpers in a tight ring/cluster around their parent's slot
(deterministic jitter from `agentId` hash, like the existing per-pet jitter). The parent's
position is already computed; helpers offset from it by a small radius scaled to 0.5 sprites.

**Glowing thread** (`renderer-pixi.ts`, new layer):
- A `PIXI.Graphics` per helper, redrawn each frame in the ticker between the helper's live
  anchor and the parent's live anchor (both via `livePosition(key)`).
- Style: 2px line, campfire/amber colour with additive glow (a second, wider, lower-alpha
  stroke underneath), gentle **catenary droop** (sample a quadratic with a sag proportional to
  distance) and a subtle time-based pulse on alpha. (Time source: the Pixi ticker delta
  accumulator — no `Date.now()` needed.)
- Layer placement: just **below** the body sprites so pets render on top of the thread.
- Lifecycle: created when a helper view appears, destroyed when the helper's outro completes.

**Errand system** (`renderer-pixi.ts`, extends `stepWalk` ~279–319): add an optional override on
the `Slot`:

```ts
interface Errand {
  target: { x: number; y: number };   // parent or player live anchor (resolved per frame)
  onArrive: () => void;                 // fire coin + sound
  then: "poof" | "return-to-camp" | "resume";
}
```

- When a slot has an `errand`, the mover routes to `target` (resolved each frame from the live
  anchor of the parent/player so it tracks a moving target), ignoring zone routing.
- On arrival (within `ARRIVE_EPS`): call `onArrive()` once, then execute `then`:
  - `poof` — play the sparkle, then remove the slot (helper).
  - `return-to-camp` — set a follow-up errand to the camp cluster, `then:"resume"`.
  - `resume` — clear the errand; normal zone routing resumes.
- Body layers swap to the existing **run** animation while travelling (same as zone travel).

**Coin rework** (`PixiStage.tsx`): the current effect (~323–358) fires a coin from pet→player
the instant `tokens` increases. Replace its **trigger** with delivery-on-arrival:

- **Helper → parent:** when a helper disappears from `/subagents`, move it (via the app's
  "retiring helpers" set, see below) into an errand: walk to the parent, `onArrive` → spawn the
  coin `Flyer` from the helper to the parent + `play("coin")`, `then:"poof"`.
- **Pet → player:** on the existing **active→idle** transition (~292), give the pet an errand:
  walk to the player (index 0), `onArrive` → coin `Flyer` pet→player + `play("coin")`,
  `then:"return-to-camp"`.
- Remove the old token-increase coin launch (its role is now the arrival hand-off). Keep the
  `Flyer` rendering + `coin` sound; only the **trigger/source** changes.

**Retiring-helpers handling** (`PixiStage.tsx`/`App.tsx`): because a helper vanishes from
`/subagents` at `SubagentStop` but must still animate its delivery + poof, the app keeps a
short-lived `Map<helperKey, { lastView, lastPos }>`. On disappearance, the helper is moved from
the live list into this retiring set with an errand; it's removed once the poof completes. This
decouples the visual outro from the data lifecycle.

**Poof** (`renderer-pixi.ts` + maybe `sound.ts`): a brief particle/sparkle burst tinted with the
parent's colour (reuse an existing sprite sheet frame or a few `Graphics` dots animated out).
Optional soft chime (reuse/extend `sound.ts`); default to no new sound to avoid clutter.

---

## 7. Types & contracts (new/changed)

**Daemon (local only):** `HelperLive` (above), `liveHelpers` map, `GET /subagents` JSON shape.

**App ↔ daemon bridge:** add a `subagents` fetch + state next to the existing `sessions` fetch.

**Render:** `Errand` interface on `Slot`; `CreatureView` gains nothing new structurally — helper
views reuse the existing shape with `scale=0.5` and a parent-seeded tint (the renderer already
supports per-slot scale via `ts`).

**No changes to:** `Event`, `Entity`, `AccountStats`, Convex schema, `getPlayerState` shape.

---

## 8. Phase plan & acceptance criteria

### Phase 0 — Verification ✅ DONE
Empirically confirmed all hook fields (see §3). No code shipped; temporary daemon instrument
reverted; repo clean.

### Phase 1 — Daemon: helper tracking + parent credit *(no engine/schema change)*
**Files:** `apps/cli/src/daemon.ts`, reuse `apps/cli/src/transcript.ts`, outbox.
**Tasks:**
- Add `liveHelpers` map + `HelperLive`.
- `SubagentStart` → track helper. Helper tool events (with `agent_id`) → set `action`.
- `SubagentStop` → `readTokenUsage(agent_transcript_path)`, coalesced parent token credit, drop
  helper.
- Parent `Stop`/`SessionEnd` → clear that parent's helpers.
- `GET /subagents` endpoint (local-only, same guards as `/sessions`).
**Acceptance:**
- Spawn a real fan-out; `curl 127.0.0.1:47615/subagents` shows helpers appear/disappear with
  correct `action`.
- Parent's `tokensFed` increases by ~the helpers' token sum after they finish (observed via the
  app/getPlayerState).
- No new entity rows; ledger growth ≈ one credit event per parent per flush tick.

### Phase 2 — App: mini-pets + thread *(static; no walking)*
**Files:** `App.tsx`, `PixiStage.tsx`, `render/compositor.ts`, `render/renderer-pixi.ts`,
`render/layout.ts`.
**Tasks:**
- Fetch `/subagents`; build helper `CreatureView`s (0.5 scale, parent species, parent-seeded
  tint, job action); cluster around parent.
- Thread layer (glowing, drooping, redrawn per frame).
**Acceptance:**
- Helpers appear at 50% beside their parent, **colour + species match**, thread connects them,
  job animation reflects `action`. Multiple parents each show their own helpers. Big fan-out
  (~16) renders without jank.

### Phase 3 — App: errand choreography + coin rework *(the new subsystem)*
**Files:** `render/renderer-pixi.ts`, `PixiStage.tsx`, `render/sound.ts`.
**Tasks:**
- `Errand` override in `stepWalk` (target tracks live anchor; `onArrive`; `then`).
- Retiring-helpers set; helper outro: walk→parent → coin+cha-ching → poof.
- Pet outro: active→idle → walk→player → coin+cha-ching → return-to-camp.
- Remove old token-increase coin trigger; keep `Flyer` + `coin` sound at arrival.
- Poof sparkle.
**Acceptance:**
- End-to-end: helper finishes → walks to parent → coin + cha-ching → poof. Pet finishes turn →
  walks to player → coin → returns to campfire. No duplicate/lost coins; targets tracked even
  while moving.

### Phase 4 — Polish
- Thread sway/pulse tuning; catenary sag; poof particles.
- Performance pass for large fan-outs (thread Graphics reuse/pooling).
- Suppress helper name labels.
- Tune helper cluster radius / overlap.

---

## 9. Scaling analysis (10k+ concurrent users)

**Rejected (full per-subagent entities):** each subagent = 1 `register` + 1 `activity` (+ N
forwarded tool events) → for a 16-way fan-out, ~32+ ledger appends and 16 entity upserts **per
fan-out per user**. At 10k users doing periodic fan-outs this is large write-amplification on
the `ingestEvent` hot path (append + upsert + rate-check each), for entities that live seconds
and are only visible on one machine. ❌

**Chosen (hybrid):**
- **Server writes per fan-out:** ~**1** coalesced `activity` (parent token credit) per parent
  per flush tick — independent of subagent count. ✅
- **No new tables/rows/columns.** `getPlayerState` payload unchanged in shape. ✅
- **Local cost only:** helper tracking is an in-memory map per daemon; the `/subagents` endpoint
  is a local read; rendering N helpers is GPU/CPU on the one machine (bounded by that user's own
  fan-out, not by global user count).
- **Backpressure:** coalescing + idempotent `clientEventId` + existing outbox retry keep bursts
  smooth. Rate ceiling in `ingestEvent` is effectively untouched.

Net: backend load is **flat in subagent count** and identical in shape to today's per-session
activity traffic.

---

## 10. Privacy analysis

- The `/subagents` channel and `liveHelpers` carry **only** `{agentId, agentType, action,
  startedAt}` — opaque ids, a category enum, a timestamp. No prompt, no code, no tool input, no
  `last_assistant_message`.
- `agent_transcript_path` is read **locally** for a **numeric token count** only (same as the
  existing main-transcript read at `Stop`). The transcript content never leaves the machine.
- The only thing crossing to Convex is `tokens` (a number) on the parent's activity event —
  structurally identical to today's token crediting.
- No new schema field could carry prompt/code text (none is added). Structural-privacy invariant
  preserved.

---

## 11. Edge cases & failure modes

| Case | Handling |
|------|----------|
| `SubagentStop` missed (crash/kill) | Parent `Stop`/`SessionEnd` clears the parent's `liveHelpers`; app prunes helpers whose parent is gone/idle. |
| Helper disappears before its sprite is placed | Retiring set falls back to the parent's position for the (degenerate) walk, or skips straight to poof if no last-known position. |
| `readTokenUsage` fails for a helper | Credit 0 tokens (no coins for that helper, or a small nominal pop — default 0). Never throw. |
| Huge fan-out (e.g. 50+) | Render-all (D5) but pool thread `Graphics` and cap particle spawn; watch frame time (Phase 4). |
| Nested subagents (a subagent spawns its own) | `agent_id`/`session_id` still identify them; they attach to the same parent `session_id`. Treat all as helpers of that session (flat), which matches the visual intent. |
| Parent pet not yet present in `getPlayerState` when helper arrives | Defer helper rendering until the parent slot exists (join by `sessionId`); helpers without a visible parent are held, not orphaned. |
| Multiple machines on one account | Helpers show only where they run; the parent's credited tokens still sync everywhere (hybrid). |
| Daemon restart mid-fan-out | `liveHelpers` is in-memory → helpers vanish (poof-less) on restart; parent credit already enqueued in the durable outbox survives. Acceptable. |

---

## 12. Testing strategy

- **Engine:** unchanged → existing Vitest suite must stay green (`pnpm test`). The parent credit
  is just an `activity{tokens}` — covered by existing reducer tests.
- **Daemon:** manual capture harness (the Phase-0 method) to assert `/subagents` transitions and
  parent credit on a real fan-out. Optional unit test for the tool→action mapping on
  `agent_id`-bearing events and the coalescing logic.
- **Render:** manual visual verification (the campfire scene) for each phase's acceptance
  criteria; a scripted fan-out (3 then ~16 helpers) to eyeball colour match, thread, delivery,
  poof, and frame time.
- **CI:** `pnpm run ci` (engine-purity + typecheck + convex typecheck + tests) must pass; note
  engine purity is irrelevant here (no engine changes) but must not regress.

---

## 13. Rollout & flagging

- Behind a small client flag (e.g. a `render` config bool `SUBAGENT_PETS`) so the visual layer
  can be toggled while iterating; default on once Phase 3 lands.
- Daemon `/subagents` + parent credit are harmless if the client ignores them, so the daemon
  change can ship first (Phase 1) without UI.
- No migration: no schema/data changes.

---

## 14. Open questions (non-blocking; have defaults)

1. **Thread shape** — taut vs slack droop. *Default: slack droop + subtle pulse.*
2. **Poof sound** — silent vs soft chime. *Default: silent (coin cha-ching already marks it).*
3. **Helper cluster layout** — ring vs scatter around parent. *Default: deterministic scatter
   (reuse per-pet jitter).*
4. **Coins per helper** — exact mapping from helper tokens → number of coin sprites. *Default:
   reuse whatever mapping the current pet→player coin effect uses, applied at arrival.*

---

## 15. Out of scope / future

- Per-helper name labels / tooltips.
- Helper species driven by `agent_type` (Explore/Plan/custom → different sprites).
- Cross-machine helper replication (explicitly rejected on cost).
- Counting helper work into competitive **score** beyond `tokensFed` (server-unverifiable; keep
  excluded per existing scoring policy).
- Persisting a fan-out "history" (e.g. "this pet has spawned 1,204 helpers").

---

## 16. File-touch summary

| File | Phase | Change |
|------|-------|--------|
| `apps/cli/src/daemon.ts` | 1 | `liveHelpers` map, Subagent* handling, token credit (coalesced), `GET /subagents` |
| `apps/cli/src/transcript.ts` | 1 | reuse `readTokenUsage` (no change expected) |
| `apps/app/src/App.tsx` | 2 | fetch `/subagents`, build helper `CreatureView`s (parent species + tint, 0.5) |
| `apps/app/src/render/compositor.ts` | 2 | parent-seeded tint for helpers |
| `apps/app/src/render/layout.ts` | 2 | helper cluster placement around parent |
| `apps/app/src/render/renderer-pixi.ts` | 2,3 | thread layer; `Errand` override in `stepWalk`; poof |
| `apps/app/src/PixiStage.tsx` | 2,3 | helper views + retiring set; coin trigger rework |
| `apps/app/src/render/sound.ts` | 3 | reuse `coin`; (optional) poof chime |
| `packages/engine/*` | — | **no change** |
| `convex/*` | — | **no change** |

---

*End of plan.*
