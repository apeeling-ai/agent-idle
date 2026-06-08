# Adapted Visual Roadmap — plans reconciled to the real codebase

> The `specs/` and `agent_plans/` folders here are the **original Promptmon design
> docs**, imported verbatim. They were written before this repo existed and assume a
> different stack. This file is the bridge: **what changed, and what the visual next
> steps actually are given the architecture that is built and working today.** Read the
> originals for vision; read this for what to do next.

---

## 1. Where the plans and the code diverge (read first)

The plans are coherent, but several load-bearing assumptions no longer match reality.
Don't follow the originals literally on these points:

| Topic | Original plan says | What we actually built | Take the code's side |
|---|---|---|---|
| Backend | Hono + Postgres + a hand-rolled HMAC event ledger | **Convex** — append-only `eventLedger`, `ingestEvent`, reactive `getPlayerState` | ✅ code |
| Auth / anti-cheat anchor | GitHub OAuth + per-account HMAC on every event | **Convex Auth** (Password + GitHub); trust is `ctx.auth.getUserIdentity()`; one machine-shared session token | ✅ code |
| Core resource | `hunger` (drains) | `energy` (drains; liveness derived lazily, **no tick**) | ✅ code |
| The creature | **one** named persistent pet whose "soul" you set once | **one pet per Claude Code session**, auto-spawned, auto-despawned; the "player" is the persistent account avatar that pets feed coins to | ✅ code |
| Renderer | Canvas → PixiJS | **PixiJS already**, behind the `compositor.ts` seam | ✅ code |
| World layout | an ambient single creature | **a transparent vertical column of creature slots** over the desktop (player on top, sessions below) | ✅ code |
| Failure state (D1) | faint-recover vs permanent death, chosen via `failureMode` | **death is always recoverable**; `mode` kept for future tuning only | ✅ code |
| Prompt quality in rank | a scoring term | **excluded from competitive score** (client-computed, server-unverifiable) — see `config.ts SCORING` | ✅ code |
| CLI sensor | Claude Code hook only | **Claude Code _and_ Codex** | ✅ code |

What the plans got **right and still governs us:** the three non-negotiables —
(1) pure engine, (2) server is the only writer of canonical state, (3) cosmetics are
z-ordered render layers, never redraws. All three are honored in the current code and
must stay that way.

---

## 2. The honest state of the *visuals* today

The engine, backend, sensor, auth, and the layered compositor are real and working.
**The visual layer is the least-built part**, and that is exactly where the plans'
payoff ("visible earned armor", "a little world", the share card) lives. Concretely:

- **The world is creatures floating on a transparent background.** No ground, no
  environment, no place. The Pixi stage draws each session-pet in a slot and that's it.
- **Earned armor is invisible.** `compositor.ts` already has `base → body → head → aura
  → status` layers and `unlocks.ts` already grants `helm.bronze`, `armor.scribe`,
  `aura.streak`, etc. — but `cosmeticForLayer` is a stub and the renderer's cosmetic
  preload is a `TODO`. **Nothing you unlock shows up.** This is the single biggest gap
  between promise and product.
- **Mood is one tint.** The `status` layer only does a "drained" tint. The UX mood map
  (`in_the_zone → content → peckish → desperate`, plus `confused`) isn't rendered.
- **The Environment art pack is 100% unused.** `sprites/Environment/` ships Stations
  (Anvil, Furnace, Sawmill, Bonfire, Cooking, Alchemy, Workbench), Tilesets (dungeon,
  floors, walls, water), Props (rocks, ore/resources, trees, vegetation), plus Mobs
  (orcs, skeletons) and NPCs (Knight, Rogue, Wizard). **The raw material for "zones"
  is already in the repo.**
- **The share card is a 1 KB stub** (`render/sharecard.ts`). The plans call this the
  single most important growth feature.

---

## 3. The visual next steps, in order

Each step is small, additive, and builds on the compositor seam. Ordered by
value-per-effort and by dependency.

### V1 — Make armor visible (highest value, lowest risk)
The progression already exists; it just doesn't render. Wire it end to end:
- Fill in `cosmeticForLayer` and preload helm/armor/aura sheets in `renderer-pixi.ts`.
- Add the first real cosmetic sheets (the pack's Weapons/Icons + recolored body trims
  can stand in until commissioned art lands).
- **Done when:** crossing the `helm.bronze` token threshold visibly puts a helmet on
  the pet — proving the "earned, visible status" loop the whole product rests on.

### V2 — Ground & environment layer (the foundation for "zones") — ✅ SHIPPED
Added two new layers below `base` in the compositor: `ground` (a floor pad) and `scene`
(a station/prop behind the sprite).
- `LAYER_ORDER` is now `["ground", "scene", "base", "body", "head", "aura", "status"]`.
- Ground/scene art is a pure data manifest (`SCENE_SHEETS` in `render/sprites.ts`) of
  cropped sub-rects of the `Environment/` atlases; `AnimationSpec` gained `x/y/frames`
  so a spec can crop an atlas tile or play a short prop loop (the bonfire animates).
- The renderer loads them into the same cache as the character bodies (namespaced keys),
  and places `ground`/`scene` differently from creature layers (`placeSprite(…, layer)`).
- **Done:** every pet now stands on a floor pad instead of floating; the overlay reads
  as a place.

### V3 — Activity → station mapping ("zones" you can read at a glance) — ✅ SHIPPED
`compositor.ts` gained a pure `zoneForView(view)` that derives a **diorama zone** from
liveness + activity, and `buildScene` sets the ground + scene layers from it:
- `mine` (active) → dark dungeon-stone floor + a boulder
- `collect` → `grove`: warm sand floor + an ore/resource pile
- `slice` → `forge`: wood-plank floor + a smith's anvil
- idle/resting → `camp`: wood floor + an animated bonfire
- fainted/dead → `rest`: bare stone floor, no prop
- This is "some of the zones" in the **ambient-overlay form that fits the current
  product** — not a separate map (that's V6/Path B).
- **Done:** a working pet visibly mines at a boulder; an idle one rests by a fire; the
  scene tells you what each session is doing without reading the label. Verified across
  all states via the `?harness` route.

> **Tuning knobs** for the look (all pure data): crops in `SCENE_SHEETS`
> (`render/sprites.ts`); pad/prop size + offset in `placeSprite` (`renderer-pixi.ts`);
> the zone mapping in `zoneForView` (`compositor.ts`). Next polish ideas: shrink the
> boulder/anvil slightly so they crowd the pet less; add more zones (a `Coding Matrix`
> flow tile, an `On-Call Watchtower` for night/idle) by adding a `ZoneId` + two manifest
> rows.

### V4 — Mood & status poses (UX mood map)
Render the `status` layer per the UX plan: distinct, colorblind-safe cues (posture/icon,
not color alone) for `weary / drained / fainted`, plus the transient `confused` after a
junk-food prompt. Honor reduced-motion.
- **Done when:** you can tell a pet's state in a half-second peripheral glance.

### V5 — The share card (`sharecard.ts`)
Render, **through the same compositor**, an image of creature + equipped armor + token
total / rank. One tap to export a timeline-sized raster.
- **Done when:** one click produces a clean, postable card that looks good small.

### V6 — Path B proper (the island)
Only after V1–V5. This is where the originals' `03_zones_path_b.md` becomes real:
- Add `packages/engine/src/zones.ts` — zones as **pure data** (id, type, the
  resource(s) it produces/consumes, the assignment rule). `zoneAchievements` already
  exists in scoring and `cape.explorer` already requires `zoneAchievements >= 3`, so
  the engine hooks are pre-wired.
- Introduce the resource roadmap from `03_engine.md`: `tokens` (have it), then `ore`,
  `burnout`, `techDebt` — each is just a new entry in the resource table, no rewrite.
- Eventually: a real opaque "world view" scene (separate from the ambient overlay) with
  placed zones, NPCs (the pack's wizard/knight/rogue), and mobs (orcs/skeletons as the
  "bugs"). This is the big one — a Phase-7 effort, not a next step.

---

## 4. How "zones" map onto THIS architecture

There are two readings of "zones," and they are different amounts of work:

**Reading A — ambient diorama zones (fits today's product, do this first).**
A zone is *the place a session-pet stands while it does its thing*. It reuses the slot
grid, the compositor, and the Environment art already in the repo. It is V2 + V3 above:
a `ground` layer + an activity→station map. Small, additive, ships visible "zones" in
the ambient overlay without changing what the product *is*.

**Reading B — the island map (Path B, the eventual destination).**
A separate, opaque world scene you open — pets walk between placed zones, each with
minigames, NPCs, and bosses. This changes the product from "ambient overlay" to "game
window." It needs the engine `zones.ts` data model, an assignment system, and a second
renderer scene. This is `specs/03_zones_path_b.md` and it is **months**, sequenced
after the core visual loop (V1–V5) proves out.

**Recommendation:** start with Reading A. It honors the non-negotiables (the `ground`
layer is just another z-ordered layer; no engine impurity; server still authoritative),
uses art we already shipped, and turns "zones" from a doc into something on screen this
week. Reading B is the north star, not the next commit.

---

## 5. What NOT to do (guardrails carried from the plans)

- Don't put IO/timers/DOM in `packages/engine` — purity is CI-enforced.
- Don't let a client write totals — the server reduces the ledger; clients emit events.
- Don't fork the compositor for the share card or board avatars — one layer stack.
- Don't add any field that could carry prompt text or source code — privacy is
  structural.
- Don't weight client-computed prompt quality into competitive rank — it's
  server-unverifiable (see `config.ts`).
- Don't build Reading-B zones before the V1–V5 visual loop exists.
