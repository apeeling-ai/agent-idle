# Agent Idle — Visual Work Session & Next-Phase Plan

> Branch: `feat/pet-work-zones-spawnwalk` (PR #4). Captured 2026-06-10 so the work + the
> multi-agent research survive a pull of Thijmen's branch (expected merge conflicts).
> Re-appliable patches live beside this file: `2026-06-visual-session.patch` (one diff,
> `git apply`) and `patches/000*.patch` (per-commit, `git am`).

---

## Part 1 — What we changed this session

Two commits on top of `origin/main` (`1320cd4`, `471ae1a`), all in the render layer + the
CLI sensor daemon. Five files:

### `apps/app/src/render/compositor.ts`
- New `WorkKind` union + `WORK_KINDS` + `isWorkKind()` guard + `WORK_MAP` (workKind → {zone, anim}).
- `zoneForView()` now returns the **work zone** whether active OR idle (a pet stands by its
  activity when idle instead of walking to camp); only a no-work view falls back to `camp`.
- `statusToAnimation()` plays the work-kind's action when active.
- `CreatureView` gained `workKind?`; `RenderItem` gained `isPlayer?`; `showAll` passes `isPlayer`.
- **`viewSignature()` now includes `workKind`** — the fix for a silent bug where a read→edit
  zone swap (same status/activity/equipped/seed) produced an identical signature and the
  scene was never re-pushed (PixiStage keys its showAll effect on the signature).
- `cosmeticForLayer()` is still a prefix-stub (armor not yet rendered — see Part 2 Step 5).

### `apps/app/src/render/renderer-pixi.ts`
- Floor is a **`TilingSprite` pad** (`applyGround`) + a soft **contact-shadow** ellipse per slot.
- Shared **`GROUND_Y`** contact line; feet measured per body: `WORKER_FEET_FRAC = 0.75`
  (constant across ALL worker poses → chopping no longer jumps), `PLAYER_FEET_FRAC = 1.0`,
  `PLAYER_SCALE = 0.72` (knight rendered smaller). `placeSprite` drops each sprite so its
  feet land on GROUND_Y; `isPlayer` carried on the slot.
- **Spawn-walk**: a new pet's character layers (+shadow) run in from the player's cell down
  to its tile via an `Enter` tween on the Pixi ticker (`CREATURE_LAYERS`, `tickEnters`),
  floor/prop waiting at the destination; only fires for pets that appear after boot.
- Floor pad restored to a near-square footprint; scene prop sits on the floor (`CELL*0.84`).

### `apps/app/src/render/sprites.ts`
- `ground.grove` → a clean square sand tile; `ground.lumber` → **grass** crop
  `Floors_Tiles.png (16,157,32,32)` (chopping trees is outdoors, not a sawmill floor).

### `apps/app/src/App.tsx`
- `sessionMeta` carries `work`; each pet's `CreatureView.workKind` is set from it via `isWorkKind`.

### `apps/cli/src/daemon.ts`
- `workKindForTool()` classifies the hook's `tool_name` into read/edit/run/web/think
  (a category only — no prompt/code text leaves the machine).
- `sessionMeta.work` is set on PreToolUse and **kept sticky** (NOT cleared on Stop), so an
  idle pet keeps standing by its last activity. Served over loopback via `/sessions`.

### Outside the repo — Claude Code hooks + sounds (`~/.claude/`, won't be in the merge)
- `settings.json` hooks: **SessionStart** → `agent-idle-up.sh` (plays peon *“Ready to work!”*
  + idempotently starts convex+vite+daemon and opens the app); **Notification** →
  `play-need.sh` (peon *“What you want?”* + stamps `/tmp/agentidle-need`); **Stop** →
  `play-done.sh` (50/50 *“Work work!”* / *“Okiedokie”*, but **silent if a need-ping just
  fired**). Sounds in `~/.claude/sounds/` (converted from the peon-ping pack via the
  Remotion-bundled ffmpeg + `DYLD_FALLBACK_LIBRARY_PATH`). NB: Claude Code snapshots hooks
  at session start — hook-config edits need a fresh session.

### Known-good
- `pnpm run ci` green (engine-purity, all typechecks, convex typecheck, 34 engine tests).
- Verified the work-kind path end-to-end against the live daemon `/sessions`.
- **Open bug (not yet fixed):** a thin vertical line under each creature — see Step 2 below.

---

## Part 2 — Multi-agent research output (11 agents, ~1.46M tokens)

UX designer + architect led 3 engineers; each proposal adversarially reviewed; merged into
one ordered plan. Run id `wf_231cae42-583` (script saved under the session's workflows dir).

### Vision (UX)
A user glancing at the desktop column should instantly read three things without parsing a single label: WHO is thriving (earned armor/auras visibly accrete on pets that have done real work — a bare worker vs. a bronze-helmed, scribe-plated veteran), WHAT each session is doing right now (the diorama zone — mining a boulder, chopping a tree, fishing — already reads), and HOW alive each one is (a calm, legible liveness ladder from in-the-zone to fainted, conveyed by posture and a quiet icon, never by color alone or by frantic motion). The feeling target is "a tended garden of little workers": pride at the decorated veterans you grew, gentle guilt at the drooping idle ones, and zero anxiety from the rendering itself (no flicker, no stray vertical-line artifact, no motion for users who asked for none). Earned status must feel *owned* — the helmet is proof you fed it 50k tokens, sitting on the pet's head as a permanent, screenshot-worthy fact, not a number in a menu.

**Earned-armor feel:** Earned armor should feel like a permanent, legible badge that accretes — proof of work, not decoration you chose. Three principles. (1) READABLE AT 64px: with only stand-in art, the strongest signal is SILHOUETTE + a metal-tone accent, not detail — a helm is a distinct shape breaking the head outline (bronze = warm/amber accent, iron = cool/steel accent, distinguishable by VALUE and shape so it survives grayscale and the per-pet recolor multiply-tint); scribe armor is a chest-band/trim recolor that visibly bulks the torso; the streak aura is a soft additive ring/glow behind the pet (the one place a colored glow is acceptable because it's clearly an effect, not the body). (2) ACCRETIVE, NOT SWAPPED: tiers replace within a slot (bronze→iron helm) but slots stack (helm + armor + aura together), so a veteran pet visibly carries more than a fresh one — the column becomes a readable hierarchy of who-grew-most at a glance. (3) STAND-INS THAT DON'T LIE: acceptable proofs-of-concept are a cropped Weapons/Icons sprite pinned to the head, a recolored body trim, or a procedural Pixi Graphics overlay (a filled helm arc, an aura ring) — chosen so that when commissioned sheets land, ONLY the COSMETIC_SHEETS manifest row changes, never the layer wiring. The cosmetic must ride the body perfectly (G6): a helm that floats for even a frame when the pet switches to a chop swing destroys the 'it's wearing this' illusion, so alignment to the shared feet/GROUND_Y contract is part of what 'earned armor' feels like — solid, attached, yours.

### UX goals
- **[P0] G1 — Kill the vertical-line artifact under every creature**
  - Why: A thin vertical line renders under each pet through the shadow in EVERY cell regardless of zone — it's the most visible polish defect and it undermines the 'real place' illusion V2/V3 bought. It must die before we layer more art on top, or every new cosmetic inherits the same dirty backdrop. Likely a TilingSprite UV-bleed seam (the floor pad samples a half-texel past the 48px atlas crop) OR a 1px gap where the tiled pad's edge meets a non-integer PAD_W; both are fixable in applyGround/placeSprite.
  - Acceptance: Open ?harness, cycle every zone (mine/lumber/grove/pond/camp/rest) and both player+pet at 1x and 2x device-pixel-ratio. Screenshot each: NO vertical line appears beneath any creature or through any shadow. Confirm root cause is named in the PR (UV inset vs. sub-pixel pad geometry), not merely masked by nudging a sprite over it.
- **[P0] G2 — Make earned armor visibly render end-to-end (the core loop)**
  - Why: This is THE single biggest gap between promise and product per the roadmap. unlocks.ts already grants helm.bronze/iron, armor.scribe, aura.streak, cape.explorer at stat thresholds, the compositor already has body/head/aura layers, and getAccountState already SERVES per-pet `unlocks` — but cosmeticForLayer is a prefix-stub, the renderer's cosmetic preload is a TODO, and NOTHING is wired to flow `unlocks` into the view's `equipped`. Until a crossed threshold puts visible gear on a pet, the entire progression is invisible.
  - Acceptance: In ?harness, a pet with stats above the helm.bronze threshold renders a distinct helmet layer on its head that tracks the body across idle/run/work/death poses and the spawn-walk (no detach, no z-order flip — head draws above body, aura above head). Crossing the iron threshold swaps bronze→iron. A pet below threshold shows no helmet. Verified with stand-in art (weapon/icon crop, recolored body trim, or a procedural Pixi Graphics overlay) — commissioned sheets NOT required to pass.
- **[P1] G3 — Decide and wire the unlocks→equipped path (auto-equip on unlock)**
  - Why: owned/equipped is a stored array nothing populates from `unlocks`, and the player view hardcodes equipped:[] (App.tsx:193). Without a rule, G2 has no data to render in production even after the renderer can draw it. Server is the only writer of canonical state, so the decision belongs in the ingest/reduce path or in a pure derive-on-read — NOT a client write. Simplest shippable rule: auto-equip the highest-tier unlocked cosmetic per slot (head/body/aura), derived from `unlocks` on read, so crossing a threshold equips with no extra UI.
  - Acceptance: A pet whose tokensFed crosses 50k shows the bronze helm in the LIVE app (not just harness) within one getAccountState refresh, with no manual equip step and no client-side total write. Engine purity check still passes; the equip derivation is pure and unit-tested (above iron threshold ⇒ iron not bronze; below all ⇒ none). The player avatar also resolves its own equipped from account-aggregate unlocks instead of the hardcoded empty array.
- **[P1] G4 — Render the full liveness/mood ladder (colorblind-safe, reduced-motion-aware)**
  - Why: Mood is currently one 'drained' tint — the UX ladder (in_the_zone→content→weary/peckish→drained→fainted, plus transient confused) isn't legible, and a tint alone fails colorblind users and conveys nothing in a peripheral glance. This is V4 and it's what makes the 'tended garden' emotional read work: you should feel the drooping pet before you read its label.
  - Acceptance: Each liveness rung has a SHAPE/POSTURE/ICON cue distinct without color (e.g. a sleep 'z', a sweat drop, a downed pose, a '?' for confused), verifiable by a grayscale screenshot test in ?harness covering every rung. With prefers-reduced-motion set, status cues hold a static frame (no looping bob/pulse) while still being distinguishable. The status layer never relies solely on hue to differentiate two rungs.
- **[P2] G5 — Preload cosmetic + status sheets and a harness cosmetic matrix**
  - Why: renderer-pixi preload() only loads CHARACTER_SHEETS+SCENE_SHEETS; the cosmetic-sheet TODO means unknown cosmetic keys silently leave the layer empty, which would make G2/G3 'work' on paper but draw nothing. And we can't iterate on armor look without a dedicated harness view crossing every cosmetic against every pose. This is the test surface the whole armor effort is verified through.
  - Acceptance: preload() loads a COSMETIC_SHEETS manifest (namespaced keys helm.*/armor.*/aura.*) into the shared cache; a missing cosmetic sheet logs a dev warning rather than silently no-op'ing. ?harness gains a matrix toggling each cosmetic id across idle/run/work/death so a designer can eyeball alignment in one screen. Adding a new cosmetic = one manifest row + one unlock rule, no renderer edits.
- **[P2] G6 — Lock cosmetic layer alignment to the shared GROUND_Y/feet contract**
  - Why: body/head/aura are separate AnimatedSprites in separate layer containers; if they don't inherit the exact same feet/anchor math as base (WORKER_FEET_FRAC 0.75, the shared GROUND_Y), a helmet will float above or sink into the head when poses switch — the same class of bug the feet-alignment work just fixed for bodies. Getting this contract explicit now prevents every future cosmetic from drifting.
  - Acceptance: A helmeted pet keeps the helm pixel-locked to the head pixel across idle↔mine↔slice↔collect↔death and through the entire spawn-walk (the cosmetic container rides the same y-offset as base during tickEnters). placeSprite applies one shared feet/anchor function to base AND cosmetic layers; a harness toggle that rapidly cycles poses shows zero helm jitter relative to the head.

**Mood cues (colorblind-safe, reduced-motion-aware):**
- in_the_zone (active, healthy): upright working pose at its zone, brisk swing; OPTIONAL tiny upward spark/'!' that does NOT depend on color. The motion itself reads as energy — no extra status icon needed.
- content (alive, idle, well-fed): relaxed standing idle, occasional slow blink/breath bob. No status overlay — absence of a cue IS the 'fine' signal, so a healthy pet stays visually quiet.
- weary/peckish (energy dropping): a slow downward head droop + a small monochrome sweat-drop or half-circle 'tired eye' icon above the head. Posture change carries the meaning; the icon is a shape, not a hue. Slight desaturation of the BODY (lightness shift, not a colored tint) reinforces without being the sole signal.
- drained (near-faint): pronounced slumped posture, a sleep-'z' or low-battery glyph (outline shape) above the head, body lightness pushed lower. Currently the only rendered mood — must gain its shape glyph so it's distinct from weary in grayscale.
- fainted (transient swoon before death): the down/lying pose (shared with death) plus a circling-stars or spiral glyph so fainted reads as RECOVERABLE-down, distinct from dead's flat hold. Honors reduced-motion by freezing the glyph on one frame.
- dead: flat lying pose held still, glyph removed (or a faint outline marker), low lightness — the 'gone-quiet' end of the ladder; return plays the existing revive (get-up) so recovery is felt.
- confused (transient, after a junk/low-quality prompt): a single '?' shape glyph that pops once and fades, no looping — the only purely-transient cue, must never persist or it reads as a stuck state. Reduced-motion: show one static '?' frame then clear.

### Architect — work packages
3 parallel WPs.

_Non-negotiable check:_ Pure; layers.

#### A — Armor: unlocks to equipped + preload
- Scope: Threshold equips tier gear. Owns equip derive, cosmeticForLayer, preload, server read. G2,G3,G5.
- Target files: packages/engine/src/equip.ts, apps/app/src/render/compositor.ts, convex/events.ts
- Approach: Pure selectEquipped; getPlayerState equipped; tier-aware cosmeticForLayer; COSMETIC_SHEETS; preload.
- Risks: Keep signature.
- Acceptance: bronze helm, iron swaps; live 50k.
- Independence: cosmeticForLayer+preload only; not status(B)/viewSignature(C).

#### B — Mood ladder + line fix
- Scope: Mood ladder; gap-free ground + integer pad. G1,G4.
- Target files: apps/app/src/render/renderer-pixi.ts, apps/app/src/render/compositor.ts
- Approach: Gap-free ground; statusOverlay; STATUS_SHEETS; reduced-motion.
- Risks: C owns scene branch.
- Acceptance: No line 1x/2x; grayscale rungs.
- Independence: applyGround/placeSprite/statusOverlay; not cosmeticForLayer(A).

#### C — Share-card + matrix + workKind
- Scope: Offscreen PNG, matrix, viewSignature workKind. G5,V5.
- Target files: apps/app/src/render/sharecard.ts, apps/app/src/render/renderer-pixi.ts
- Approach: renderSceneToImage; viewSignature workKind; matrix.
- Risks: Detached RenderTexture.
- Acceptance: Real PNG via same stack.
- Independence: sharecard + offscreen method; only viewSignature.

### Final ordered implementation plan
**Headline:** Ship the diorama in conflict-free waves: land C's silent-bug viewSignature fix first, then the G1 line-artifact fix and C's share-card export, then A's pets-only earned-armor (with its two required fixes), and finally re-commission B's mood ladder. A+C are real and verified; B is an empty placeholder and is replaced here by two concrete steps (G1 artifact, G4 mood ladder).

**Recommended first commit:** Step 1 — the one-line viewSignature(workKind) fix in apps/app/src/render/compositor.ts. It is the smallest, highest-value, lowest-risk change: it fixes a CONFIRMED silent bug where a read->edit work-zone swap (same status/activity/equipped/seed) produces a byte-identical signature, so PixiStage's showAll effect (keyed on sig, line 120) never fires and the boulder->tree swap this very branch shipped is dropped. Zero merge surface with any other step, fully purity/privacy-safe (workKind is already a client-only category enum on CreatureView, never sent to the server). Commit message subject: \"fix(app): include workKind in viewSignature so work-zone swaps re-push\".  
_(Done — shipped as `471ae1a`.)_

#### Step 1 — viewSignature includes workKind (fix the silent zone-swap drop)  (pkg C)
In compositor.ts viewSignature() (lines 226-228), append `view.workKind ?? "-"` to the joined array. This is the only change in this step. Verified mechanism: PixiStage.tsx builds `sig` from viewSignature (line 65) and the showAll effect is keyed on [ready, sig, cols] (line 120); zoneForView/statusToAnimation both branch on workKind but the signature omitted it, so a read->edit swap with unchanged status/activity/equipped/seed was byte-identical and never re-pushed. The renderer's internal short-circuit (renderer-pixi.ts:334 prevKey===spriteKey) would happily swap the art IF the scene were pushed, confirming the fix belongs in the signature. Keep equipped.join(",") in the signature (A relies on it for live equip re-push).
  - Files: apps/app/src/render/compositor.ts
  - Acceptance: pnpm run ci stays green. In ?harness (or live), a session whose work flips read->edit visibly swaps the boulder zone to the tree zone on a same-status transition; before this change the swap was dropped. No animation restarts for unrelated ticks (signature otherwise unchanged).

#### Step 2 — Kill the vertical-line / ground-seam artifact (G1) — replaces part of empty Package B  (pkg B-rewrite)
Package B was an empty placeholder (summary 'probe 2', change {file:'a',after:'d'}) and must NOT be merged; this step re-commissions its G1 half as real code. The artifact is the brief's only named open bug and must die before more art layers on top (every cosmetic otherwise inherits a dirty backdrop). Root cause is sub-pixel/non-integer TilingSprite geometry in applyGround (renderer-pixi.ts ~L399-414): PAD_W=CELL*0.96=92.16, PAD_H=CELL*0.92=88.32, tile.x=(CELL-PAD_W)/2=1.92, tile.y=CELL*0.66-PAD_H/2, and tileScale=(CELL*0.5)/tex.width are all fractional -> classic UV-bleed seam. Fix: snap PAD_W/PAD_H and tile.x/tile.y to integers (Math.round), and inset the tiling source frame ~0.5px to stop edge bleed (or set the tile texture source addressing/clamp). Also confirm the contact shadow ellipse (L253-254) is not the line — it is centered and wide, so the suspect is the ground tile; verify by toggling the ground tile off in the harness. Do NOT touch cosmeticForLayer (Step 5/A) or buildScene's scene branch.
  - Files: apps/app/src/render/renderer-pixi.ts
  - Acceptance: At BOTH 1x and 2x devicePixelRatio, no vertical line renders under any creature in any zone (mine/grove/lumber/pond/camp/rest). Verified in ?harness across all zones and at the live window. pnpm run ci green.

#### Step 3 — Offscreen share-card PNG export through the same compositor (C)  (pkg C)
Apply C's share-card changes exactly: (a) add RenderImageOptions + renderSceneToImage to the Renderer interface and a Compositor.renderToImage that calls buildScene then the renderer (compositor.ts stays Pixi-free — plain TS types + Promise<string>). (b) In renderer-pixi.ts, refactor getOrCreateSlot into a reusable makeSlot(parent,isPlayer,seed?) that carries NO this.slots/deadMemory/pendingEnter side effects, and implement renderSceneToImage: build a transient slot under a private off-stage Container (NOT this.root), drive it through the SAME applyLayer/applyGround/placeSprite paths, gotoAndStop(0) each AnimatedSprite, render the detached subtree via app.renderer.render({container:offRoot,target:rt,clearColor}), read back with app.renderer.extract.base64({target:rt,format:'png'}), and destroy rt (rt.destroy(true)) + offRoot ({children:true}) in finally. (c) Make sharecard.ts buildShareCard async, take a Compositor, return image:string. (d) Add the OPTIONAL onCompositorReady?(compositor) prop to PixiStage and call it between `compositorRef.current=local` and `setReady(true)` (lines 82-83) — render as a CONCRETE before/after diff, not prose. REQUIRED FIX from review: turn the PixiStage and DevHarness edits (delivered as prose-in-comments) into real diffs. State in the PR that cosmetic columns render EMPTY until A's COSMETIC preload lands, so empty armor is not read as an export bug. All Pixi v8 signatures verified against installed 8.18.1.
  - Files: apps/app/src/render/compositor.ts, apps/app/src/render/renderer-pixi.ts, apps/app/src/render/sharecard.ts, apps/app/src/PixiStage.tsx
  - Acceptance: pnpm --filter @agent-idle/app typecheck and pnpm run ci green. In ?harness an 'Export PNG' button produces a real saveable PNG of the diorama+creature through the same stack. After several exports the live canvas is unchanged and no extra creature/texture leaks (transient slot + RenderTexture destroyed in finally).

#### Step 4 — Dev harness matrix: zone x cosmetic x pose (C owns the matrix structure)  (pkg C)
Add C's ?harness matrix mode to DevHarness.tsx as REAL code (not prose comments): a toggle that crosses every WORK_KINDS zone against a COSMETIC_SETS list ([],[helm.bronze],[helm.iron,armor.scribe],[helm.iron,armor.scribe,aura.streak]) over the existing idle/working/dead toggles, passing equipped arrays STRAIGHT THROUGH (no tier resolution here, so it stays independent of A's cosmeticForLayer). Wire PixiStage with onCompositorReady from Step 3 and add the Export PNG button. OWNERSHIP NOTE: DevHarness.tsx is the only file both C and A want to edit — C owns the matrix STRUCTURE; A (Step 5) only contributes the equipped values into C's COSMETIC_SETS rows, it must not edit the harness independently. Reuse the exported WORK_KINDS const (compositor.ts:153) so the demo can't drift from the real enum.
  - Files: apps/app/src/DevHarness.tsx
  - Acceptance: ?harness matrix shows the five workKinds as five DISTINCT zones (proves Step 1's signature fix) and stacks more gear per cosmetic column. Cosmetic columns are bare until Step 5 lands (expected). pnpm run ci green.

#### Step 5 — Earned-armor loop end-to-end, PETS-ONLY (A) with both required fixes  (pkg A)
Apply A's changes: (1) NEW pure packages/engine/src/equip.ts (selectEquipped + slotForCosmetic, tier-aware: iron>bronze, one id per slot) + equip.test.ts; export equip.js from index.ts (insert `export * from "./equip.js";` after unlocks.js — verified that line exists and equip.js is not yet present). (2) convex/events.ts: import selectEquipped; add per-pet `equipped: selectEquipped(unlocks)` to the getPlayerState .map return (lines 193-203) and account-level `equipped: selectEquipped(evaluateUnlocks(aggregate))` to the final return (lines 224-235) — read-time derivation only, no schema field, no prompt/code text. (3) compositor.ts cosmeticForLayer becomes tier-aware (highest unlocked id per slot). (4) App.tsx: add equipped to the Pet interface (line 64-68) and use pet.equipped per pet (line 212); FEED PETS ONLY. (5) renderer-pixi.ts: add COSMETIC_SHEETS manifest + drawCosmetic + bakeCosmetic, and preload them into the FrameCache (replace the L139 TODO). REQUIRED FIX #1 (compile-blocking): replace the invalid hex literal `0x4d3venue` in armor.scribe's accent with a real value e.g. 0x4d3320. REQUIRED FIX #2 (player-avatar): do NOT wire remote.equipped into playerView — leave playerView.equipped = [] for v1, because the player renders as a knight NPC whose idle/death frames are 32px (sprites.ts:88-99) while cosmetics bake at 64px (COSMETIC_FRAME), and placeSprite scales each layer by its OWN frameH (renderer-pixi.ts:429,445) -> a half-size, mis-anchored helm on the most-seen creature. Pets (worker body, uniform 64px) are unaffected and are where the 50k/iron acceptance is verifiable. Also: strip A's false 'generateTexture graceful-degrade' claim (it returns a Texture and needs a live renderer; the if(!tex) branch is dead) but KEEP the warn-once for a missing cosmetic KEY. Fix the aura.streak comment ('glow behind the pet') — LAYER_ORDER puts aura ABOVE head/body (compositor.ts:47); off the bronze/iron path so non-blocking, but correct the comment. Add a cross-reference comment linking TIER_RANK (equip.ts) and COSMETIC_TIER (compositor.ts) so a future third tier updates both.
  - Files: packages/engine/src/equip.ts, packages/engine/src/equip.test.ts, packages/engine/src/index.ts, convex/events.ts, apps/app/src/render/compositor.ts, apps/app/src/App.tsx, apps/app/src/render/renderer-pixi.ts
  - Acceptance: pnpm --filter @agent-idle/engine exec vitest run src/equip.test.ts passes; pnpm run ci green (engine-purity, convex typecheck, app/cli typecheck, tests). In ?harness matrix: a pet with helm.bronze shows an amber dome that tracks the body across idle/mine/slice/collect/death and through the spawn-walk; switching to helm.iron swaps amber->steel (distinct by value in grayscale); empty equipped shows no helm; equipping a missing key (e.g. helm.gold) logs the dev warn once and leaves the layer empty (no crash). LIVE: a pet crossing 50k tokensFed shows the bronze helm within one getPlayerState refresh with no client write (Convex dashboard shows no new writes from the read); 250k swaps in iron. Player avatar shows NO cosmetics (gated for v1).

#### Step 6 — Mood ladder (G4) — re-commission Package B's second half  (pkg B-rewrite)
This is the rest of the empty Package B, rebuilt. Today mood is a single hue tint (status.drained in buildScene, compositor.ts:255) which fails colorblind/grayscale and conveys nothing peripherally. Add a pure status->overlay mapping in compositor.ts that emits distinct SHAPE/POSTURE/ICON cues per liveness rung (e.g. sleep-z / sweat-drop / '?' / circling-stars) on the existing `status` layer, plus a STATUS_SHEETS entry (or procedural stand-ins like A's cosmetics) and renderer applyLayer support; honor reduced-motion (static icon when prefers-reduced-motion). Cues must read in grayscale. Do NOT modify cosmeticForLayer (A) or the scene-prop branch (C). Keep packages/engine untouched. Land AFTER Steps 1-5 so the calm/legibility layer sits on a clean (seam-free) backdrop with visible armor.
  - Files: apps/app/src/render/compositor.ts, apps/app/src/render/renderer-pixi.ts, apps/app/src/render/sprites.ts
  - Acceptance: Each liveness rung shows a distinct, grayscale-legible status cue (verified by desaturating a screenshot); reduced-motion users get a static cue. pnpm run ci green. No regression to zones (Step 1) or armor (Step 5).

### Risks
- Package B as submitted is a non-functional placeholder ({file:'a',after:'d'}, summary 'probe 2') and MUST be rejected, not merged. Steps 2 and 6 replace it with concrete work; do not let A+C shipping create the illusion the diorama is 'done' while the G1 artifact and G4 mood ladder remain.
- A's delivered snippet contains a compile-blocking invalid hex literal `0x4d3venue` (armor.scribe accent in COSMETIC_SHEETS). Must be a real hex (e.g. 0x4d3320) or TS/Vite fails. Folded into Step 5.
- Player avatar renders BROKEN gear if A's remote.equipped wiring lands as-is: knight NPC idle/death frames are 32px, cosmetics bake at 64px, placeSprite scales each layer by its own frameH -> half-size, mis-anchored helm on the most-seen creature at the 50k moment. Step 5 gates player cosmetics OFF for v1 (pets only).
- DevHarness.tsx is the one genuine double-edit (C's matrix + A's equipped values). Resolved by ownership: C owns the matrix structure (Step 4), A only injects equipped values into C's rows (Step 5). Editing it independently in both will conflict.
- convex/events.ts getPlayerState's per-pet .map return and final account return are edited ONLY by A (Step 5), additively. As long as the rewritten B (Steps 2,6) stays out of convex/events.ts there is no three-way conflict there.
- C's renderSceneToImage relies on Pixi v8 render({container}) updating an off-stage container's transforms (verified against installed 8.18.1) and on destroying rt+offRoot in finally to avoid RenderTexture leaks; verify no texture-count growth after repeated exports.
- Tier rank is duplicated in equip.ts (TIER_RANK) and compositor.ts (COSMETIC_TIER) by necessity (compositor must resolve raw lists too). A future third tier requires editing both — Step 5 adds a cross-reference comment to prevent drift.
- aura.streak's intended 'glow behind the pet' contradicts LAYER_ORDER (aura above head/body). Off the bronze/iron acceptance path (needs survivalStreakDays>=7) so non-blocking, but the comment must be corrected or the glow moved below base before any aura unlock ships.

### Open questions (need Jordi)
- Mood ladder art (Step 6/G4): use procedural Pixi-Graphics stand-in icons (like A's cosmetics) for the status cues now, or wait for commissioned status-icon sheets? Stand-ins unblock the calm/legibility layer immediately.
- G1 artifact fix (Step 2): if integer-snapping PAD/tile geometry plus a 0.5px source inset does not fully kill the seam, is it acceptable to switch the floor from a TilingSprite to a single non-tiled sprite (or a Graphics-drawn pad) for v1 to guarantee no UV bleed?
- Should each PR be its own commit/branch off feat/pet-work-zones-spawnwalk, or one stacked branch? The plan assumes sequential commits on the current branch (Step 1 standalone first), but a separate tiny PR for Step 1 is also fine since it has zero merge surface.
- Player-avatar cosmetics are gated OFF for v1 (Step 5). Confirm this is acceptable short-term, or do you want body-matched 32px cosmetic art commissioned so the account avatar shows earned gear too?

---

## Part 3 — Engineer proposals (concrete changes, for re-applying)

The detailed, ready-to-apply changes each engineer produced, with the reviewer's verdict.
Use these to implement Steps 2–6 even after the merge.

### Package A — Armor: unlocks to equipped + preload  · review: **accept-with-fixes**
Wires the earned-armor loop end-to-end (G2/G3/G5) with three surgical, purity-safe changes plus one engine unit test. (1) New pure `packages/engine/src/equip.ts` exposes `selectEquipped(unlocks)` — derive-on-read, tier-aware: highest-tier helm per slot (iron > bronze), plus armor/aura/cape, no client write. (2) `convex/events.ts` `getPlayerState` adds a derived `equipped` to each pet (from its own unlocks) and a top-level account `equipped` (from aggregate unlocks) — the server stays the only writer, this is read-time derivation only. (3) `compositor.ts` `cosmeticForLayer` becomes tier-aware (picks the highest unlocked id per slot instead of first-prefix-match), and `App.tsx` stops hardcoding `equipped:[]` for the player. (4) `renderer-pixi.ts` preload bakes a procedural Pixi-Graphics stand-in cosmetic into the SAME FrameCache the body uses (no commissioned art needed), so head/body/aura layers draw through the existing `applyLayer`/`placeSprite` path and inherit the shared WORKER_FEET_FRAC/GROUND_Y math for free (G6). A missing cosmetic key warns once in dev instead of silently no-op'ing. viewSignature already includes `equipped.join(",")`, so equip changes re-push — left untouched per the independence note (signature is package C's).

**Required fixes (from review):**
- Replace the invalid hex literal `0x4d3venue` in armor.scribe's accent with a real value (e.g. 0x4d3320) before applying — this is a compile-blocking error as written.
- Fix the player-avatar cosmetic scale mismatch: NPC body idle/death frames are 32x32 but cosmetics bake at 64x64, so placeSprite scales them differently and the helm renders half-size/misplaced on the player. Either (a) gate cosmetics off the player for now (don't wire remote.equipped into playerView until art is body-matched), or (b) make placeSprite scale cosmetic layers relative to the BASE layer's frame height rather than the cosmetic's own 64px, so head/body cosmetics inherit the base body's scale. Verify the helm sits correctly on the player at the 50k threshold, not just on pets in the harness.
- Drop or correct the 'graceful degrade' reasoning around generateTexture: it returns a Texture and requires a live renderer; the `if (!tex)` branch is unreachable. Keep the dev warn-once for a MISSING cosmetic KEY (cache.get returns undefined for an unbaked id), which is the real degrade case, but don't claim generateTexture warns-and-empties headlessly.
- Reconcile the aura visual with the layer stack: aura renders above head/body per LAYER_ORDER. If a behind-the-pet glow is intended, draw it as part of a below-base layer or accept it as an over-pet ring and update the comment. Not blocking for bronze/iron acceptance but the snippet's stated intent is wrong.

**New assets/crops:** No atlas crops added — cosmetics are PROCEDURAL Pixi-Graphics stand-ins baked at preload into the existing FrameCache (no commissioned sheets exist; verified: sprites/Weapons has only Wood/Bone/Hands sheets, sprites/Icons has no PNGs, no helm/armor folders). Each cosmetic = one CosmeticSpec row in COSMETIC_SHEETS (renderer-pixi.ts) + the matching unlock id already in packages/engine/src/unlocks.ts.; helm.bronze: filled dome arc over the head (~cx,y25 r11) fill 0xcd7f32 / stroke 0x7a4a1e + brow band — warm/amber, lower value.; helm.iron: same dome shape, fill 0xc8d0d8 / stroke 0x6b7480 — cool/steel, HIGHER value so bronze→iron reads in grayscale by value+identical-shape.; armor.scribe: torso trim band rect(cx-9,33,18,8) fill 0x9b6a3c with central clasp — bulks the chest.; cape.explorer: back-drape triangle behind the torso, fill 0x3a6ea5.; aura.streak: two concentric soft-alpha stroke rings centred on the body (cx,40 r22/r16) in 0x66e0ff/0x2aa8c8 — additive-feeling glow behind the pet.; All baked into a 64x64 RenderTexture (COSMETIC_FRAME) via app.renderer.generateTexture with frame=Rectangle(0,0,64,64), so the cosmetic shares the worker body's anchor/feet math and stays pixel-locked across poses (G6). NOTE: typo placeholder '0x4d3venue' in the armor.scribe accent in the snippet must be a real hex (e.g. 0x4d3320) when applied.

**`packages/engine/src/equip.ts`** — NEW FILE: Pure, tier-aware derive-on-read: unlocks → the single equipped id per slot (head/body/aura). Highest tier wins within a slot (iron helm over bronze); slots stack. No IO, no client write — callable from the Convex read AND the app. This is the G3 auto-equip rule.
```ts
/**
 * Equip derivation — pure, tier-aware. Given the cosmetic ids a creature has UNLOCKED
 * (see unlocks.ts / evaluateUnlocks), pick the single id that should occupy each render
 * slot (head/body/aura). Highest tier wins WITHIN a slot (iron helm replaces bronze);
 * different slots stack (helm + armor + aura together), so a veteran visibly carries more.
 *
 * Auto-equip rule (no manual UI, no client write): equip the highest-tier unlocked
 * cosmetic per slot. Server is the only writer of canonical state, so this is derived on
 * READ (in getPlayerState) and in the app's player view — never persisted by a client.
 *
 * Cosmetics are render LAYERS, never redraws; this module only decides WHICH ids are
 * equipped, never touches pixels.
 */

/** The render slots a cosmetic can occupy (mirrors the compositor's body/head/aura). */
export type CosmeticSlot = "head" | "body" | "aura";

/** Which slot an id maps to, by id prefix. Unknown prefixes ⇒ null (ignored). Pure. */
export function slotForCosmetic(id: string): CosmeticSlot | null {
  if (id.startsWith("helm.")) return "head";
  if (id.startsWith("armor.")) return "body";
  if (id.startsWith("cape.")) return "body"; // cape rides the body slot (back trim)
  if (id.startsWith("aura.")) return "aura";
  return null;
}

/**
 * Tier rank within a slot — higher wins. Listed ids beat unlisted ones (rank 1 vs 0), so a
 * new same-slot id is still equippable before it earns an explicit rank. Pure, data-driven.
 */
const TIER_RANK: Record<string, number> = {
  "helm.bronze": 1,
  "helm.iron": 2,
};
const rankOf = (id: string): number => TIER_RANK[id] ?? 1;

/** The equipped cosmetic ids — at most one per slot, highest tier within a slot. Pure,
 * order-stable (head, body, aura). Empty in ⇒ empty out. */
export function selectEquipped(unlocked: readonly string[]): string[] {
  const best: Partial<Record<CosmeticSlot, string>> = {};
  for (const id of unlocked) {
    const slot = slotForCosmetic(id);
    if (!slot) continue;
    const current = best[slot];
    if (!current || rankOf(id) > rankOf(current)) best[slot] = id;
  }
  const order: CosmeticSlot[] = ["head", "body", "aura"];
  return order.map((s) => best[s]).filter((id): id is string => !!id);
}
```
**`packages/engine/src/index.ts`** — the export block (after `export * from "./unlocks.js";`): Export the new pure module so the Convex read and the app can import it identically.
```ts
export * from "./unlocks.js";
export * from "./equip.js";
export * from "./events.js";
```
**`packages/engine/src/equip.test.ts`** — NEW FILE: Unit-test the pure derive (acceptance: above iron ⇒ iron not bronze; below all ⇒ none; slots stack). Matches the existing Vitest pattern in scoring.test.ts.
```ts
import { describe, expect, it } from "vitest";
import { selectEquipped, slotForCosmetic } from "./index.js";

describe("selectEquipped — tier-aware auto-equip", () => {
  it("equips nothing from no unlocks", () => {
    expect(selectEquipped([])).toEqual([]);
  });

  it("equips the bronze helm when only bronze is unlocked", () => {
    expect(selectEquipped(["helm.bronze"])).toEqual(["helm.bronze"]);
  });

  it("prefers iron over bronze in the head slot", () => {
    expect(selectEquipped(["helm.bronze", "helm.iron"])).toEqual(["helm.iron"]);
    // order of unlocks must not matter
    expect(selectEquipped(["helm.iron", "helm.bronze"])).toEqual(["helm.iron"]);
  });

  it("stacks one id per slot (head + body + aura)", () => {
    const out = selectEquipped(["helm.iron", "armor.scribe", "aura.streak", "helm.bronze"]);
    expect(out).toContain("helm.iron");
    expect(out).toContain("armor.scribe");
    expect(out).toContain("aura.streak");
    expect(out).not.toContain("helm.bronze");
    expect(out).toHaveLength(3);
  });

  it("maps prefixes to slots", () => {
    expect(slotForCosmetic("helm.iron")).toBe("head");
    expect(slotForCosmetic("armor.scribe")).toBe("body");
    expect(slotForCosmetic("aura.streak")).toBe("aura");
    expect(slotForCosmetic("nonsense")).toBeNull();
  });
});
```
**`convex/events.ts`** — import block (top), the `from "@agent-idle/engine"` named import: Import the pure equip derive into the server read.
```ts
import {
  apply,
  decay,
  evaluateUnlocks,
  newEntity,
  newStats,
  score,
  selectEquipped,
  toTrainerStats,
  type Event,
} from "@agent-idle/engine";
```
**`convex/events.ts`** — getPlayerState handler — the per-pet `.map(...)` return object (the block returning entity/liveness/stats/.../unlocks/updatedAt): Serve each pet's auto-equipped ids (derived from its OWN unlocks) alongside the existing unlocks. Read-time derivation only — no canonical write, no new schema field, no prompt/code text. Lets the app render earned gear per pet without a client equip step (G3).
```ts
        const unlocks = evaluateUnlocks(trainerStats);
        return {
          // RAW snapshot (energy at lastUpdated) so clients can re-decay on a clock
          // tick for a live active→idle transition. `liveness` is the server's read.
          entity,
          liveness: live,
          stats: row.stats,
          trainerStats,
          score: score(trainerStats),
          unlocks,
          // Auto-equipped gear, DERIVED from this pet's unlocks (highest tier per slot).
          // Read-time only — the server never persists an equip; clients never write totals.
          equipped: selectEquipped(unlocks),
          updatedAt: row.lastUpdated,
        };
```
**`convex/events.ts`** — getPlayerState handler — the final `return { account: {...}, pets, stats, trainerStats, score, updatedAt }`: Serve the ACCOUNT-aggregate equipped ids so the player avatar (the most-seen creature) can show its earned gear instead of the hardcoded empty array. Derived from the same aggregate unlocks the score uses.
```ts
    return {
      account: {
        githubLogin: account.githubLogin ?? null,
        visibility: account.visibility,
        verified: account.verified,
      },
      pets,
      stats: aggStats,
      trainerStats: aggregate,
      score: score(aggregate),
      // The player avatar's gear, derived from the account-aggregate unlocks (read-time).
      equipped: selectEquipped(evaluateUnlocks(aggregate)),
      updatedAt: now,
    };
```
**`apps/app/src/render/compositor.ts`** — cosmeticForLayer (~L210-220) — replace the prefix-stub: Tier-aware resolution: pick the highest unlocked id per slot instead of the first prefix match, so a pet owning both bronze+iron shows iron (not an arbitrary one). Pure. Mirrors selectEquipped's ranking so the compositor and the server agree, AND so a raw unlocks array (or the per-pet stored cosmetics.equipped) both resolve correctly.
```ts
/** Slot → the id prefixes it accepts (head=helm, body=armor/cape, aura=aura). */
const LAYER_PREFIXES: Record<"body" | "head" | "aura", readonly string[]> = {
  head: ["helm."],
  body: ["armor.", "cape."],
  aura: ["aura."],
};

/** Tier rank within a slot — higher wins (iron helm beats bronze). Unlisted ⇒ 1, so any
 * new id is still selectable. Kept in sync with the engine's equip.ts ranking. */
const COSMETIC_TIER: Record<string, number> = {
  "helm.bronze": 1,
  "helm.iron": 2,
};

/**
 * Decide which cosmetic id (if any) occupies a given layer. Tier-aware: among the equipped
 * ids matching this slot's prefixes, return the HIGHEST tier (so bronze+iron ⇒ iron, never
 * an arbitrary first match). Pure. Accepts either an already-deduped equipped list (from
 * selectEquipped) or a raw owned/unlocks list and still resolves one id per slot.
 */
function cosmeticForLayer(layer: Layer, equipped: string[]): string | null {
  if (layer !== "body" && layer !== "head" && layer !== "aura") return null;
  const prefixes = LAYER_PREFIXES[layer];
  let best: string | null = null;
  for (const id of equipped) {
    if (!prefixes.some((p) => id.startsWith(p))) continue;
    if (best === null || (COSMETIC_TIER[id] ?? 1) > (COSMETIC_TIER[best] ?? 1)) best = id;
  }
  return best;
}
```
**`apps/app/src/App.tsx`** — the `Pet` interface (~L63-68) and the per-pet creature map (~L207-217); plus the `playerView` (~L188-195) and the remote.account/equipped read: Stop hardcoding the player's equipped:[]; feed it the account-aggregate `equipped` the server now serves. Feed each pet its server-derived `equipped` (preferring it over the stored cosmetics.equipped, which nothing populates yet). This is the G3 production wiring — gear appears within one getPlayerState refresh, no client write.
```ts
/** A single pet as returned by getPlayerState (raw snapshot + the server's liveness read). */
interface Pet {
  entity: Entity;
  liveness: Liveness;
  stats: { tokensFed: number };
  /** Auto-equipped cosmetic ids, derived server-side from this pet's unlocks (read-time). */
  equipped: string[];
}
```
**`apps/app/src/App.tsx`** — playerView construction (~L188-195): Resolve the player's earned gear from the account-aggregate equipped the server now serves (fallback to [] when absent), instead of the hardcoded empty array.
```ts
  const playerView: CreatureView = {
    species: "knight", // the armoured "cool guy" body the player is rendered as
    status: "lively",
    activity: "idle",
    alive: true,
    // Earned gear for the account avatar — derived server-side from aggregate unlocks.
    equipped: (remote?.equipped ?? []) as string[],
    isPlayer: true, // render the armoured species body (pets render the little worker body)
  };
```
**`apps/app/src/App.tsx`** — per-pet creature map view (~L207-217), the `equipped:` field: Use the server-derived equipped for each pet (the stored cosmetics.equipped is empty since nothing writes it).
```ts
          status: live.status,
          activity: live.activity,
          alive: live.alive,
          // Server-derived auto-equip (the stored cosmetics.equipped is unpopulated for now).
          equipped: pet.equipped ?? pet.entity.cosmetics.equipped,
          tint: tintForSeed(pet.entity.id),
```
**`apps/app/src/render/renderer-pixi.ts`** — preload() (~L133-141) — replace the cosmetic TODO with a baked procedural cosmetic manifest: G5/G2: load cosmetic sheets into the SAME FrameCache the body uses, so head/body/aura layers draw through the existing applyLayer/placeSprite path (and inherit WORKER_FEET_FRAC/GROUND_Y feet-lock for free — G6). With NO commissioned art on hand, bake procedural Pixi-Graphics stand-ins into 64x64 frames (the body's frame size) so the helm/trim/aura sit pixel-locked on the head/torso. A missing cosmetic key warns once in dev instead of silently no-op'ing.
```ts
  private async preload(): Promise<void> {
    // Character bodies AND the diorama ground/scene art share one cache — keys are
    // namespaced (e.g. "knight" vs "ground.mine") so they never collide.
    for (const [key, set] of Object.entries({ ...CHARACTER_SHEETS, ...SCENE_SHEETS })) {
      this.cache.set(key, await loadSet(set));
    }
    // Cosmetic layers (helm.*/armor.*/aura.*). No commissioned sheets ship yet, so each
    // cosmetic is a PROCEDURAL stand-in baked into the same 64x64 frame box the body uses
    // — so it rides the head/torso via the shared placeSprite feet/anchor math (the helm
    // can't float relative to the head). Swapping in real art later = one COSMETIC_SHEETS
    // row, no renderer change.
    for (const id of Object.keys(COSMETIC_SHEETS)) {
      this.cache.set(id, this.bakeCosmetic(id, COSMETIC_SHEETS[id]));
    }
  }

  /**
   * Bake a procedural cosmetic into a one-frame FrameCache covering every animation name a
   * body can request, so the cosmetic shows in idle/run/work/death alike (it doesn't itself
   * animate; it rides the body container, which moves). The drawing is a 64x64 RenderTexture
   * (the body frame box) with the badge at the head/torso anchor, so placeSprite lines it up
   * exactly. A missing/empty draw warns once in dev rather than silently no-op'ing (G5).
   */
  private bakeCosmetic(id: string, spec: CosmeticSpec): FrameCache {
    const g = drawCosmetic(spec);
    const tex = this.app.renderer.generateTexture({
      target: g,
      // Pin the source rect to the full 64x64 body frame so the cosmetic's anchor math
      // matches the body's (a tight bbox would shift the helm off the head).
      frame: new Rectangle(0, 0, COSMETIC_FRAME, COSMETIC_FRAME),
    });
    g.destroy();
    const cache: FrameCache = new Map();
    if (!tex) {
      console.warn(`[agent-idle] cosmetic '${id}' produced no texture — layer will be empty`);
      return cache;
    }
    // Same single frame under every animation name a body may request, so the cosmetic is
    // present in idle/run/mine/slice/collect/fishing/death/revive without per-pose art.
    const names: AnimationName[] = [
      "idle", "run", "walk", "mine", "hit", "collect", "pierce", "slice", "fishing", "death", "revive",
    ];
    const frames = [tex];
    for (const n of names) cache.set(n, frames);
    return cache;
  }
```
**`apps/app/src/render/renderer-pixi.ts`** — module scope — add the procedural cosmetic manifest + draw helper (near the top constants, after WORKER/PLAYER feet constants ~L43): The COSMETIC_SHEETS manifest (namespaced helm.*/armor.*/aura.* keys) and a pure-ish Pixi-Graphics draw per cosmetic. Stand-ins per the armorFeel spec: helm = a filled arc breaking the head outline (bronze=warm/amber, iron=cool/steel — distinguishable by VALUE+shape so it survives grayscale); armor.scribe = a chest band/trim that bulks the torso; cape.explorer = a back trim; aura.streak = a soft additive ring behind the pet. Coordinates target the worker body's head (~y 18-26 of 64) and torso (~y 30-44). Adding a cosmetic = one manifest row + one unlock rule, no renderer-logic edits (G5).
```ts
const PLAYER_SCALE = 0.72;
const PLAYER_FEET_FRAC = 1.0;

/** The body frame box cosmetics are baked into (matches the worker body's 64x64 frame), so
 * a cosmetic shares the body's anchor/feet math and stays pixel-locked to the head/torso. */
const COSMETIC_FRAME = 64;

/** A procedural cosmetic stand-in. Drawn into a 64x64 box positioned on the head/torso of
 * the worker body. shape: which badge to draw; color/accent: fill + outline (chosen so the
 * tier reads by VALUE and shape, surviving grayscale and the per-pet multiply tint). */
interface CosmeticSpec {
  shape: "helm" | "chestBand" | "cape" | "auraRing";
  color: number;
  accent: number;
}

/**
 * The cosmetic manifest — namespaced helm.*/armor.*/aura.*/cape.* keys, matching the engine
 * unlock ids. STAND-IN art only (no commissioned sheets yet): a procedural badge per id.
 * Adding a cosmetic later = one row here + one unlock rule; swapping to a real sheet = point
 * this row at a sheet loader instead of a draw, with NO change to the layer wiring.
 */
const COSMETIC_SHEETS: Record<string, CosmeticSpec> = {
  "helm.bronze": { shape: "helm", color: 0xcd7f32, accent: 0x7a4a1e }, // warm/amber
  "helm.iron": { shape: "helm", color: 0xc8d0d8, accent: 0x6b7480 }, // cool/steel (higher value)
  "armor.scribe": { shape: "chestBand", color: 0x9b6a3c, accent: 0x4d3venue },
  "cape.explorer": { shape: "cape", color: 0x3a6ea5, accent: 0x223f5e },
  "aura.streak": { shape: "auraRing", color: 0x66e0ff, accent: 0x2aa8c8 },
};

/** Draw one cosmetic badge into a fresh Graphics, positioned for the worker body's head/
 * torso. Pure-ish (only touches the Graphics it returns). The caller bakes it to a texture. */
function drawCosmetic(spec: CosmeticSpec): Graphics {
  const g = new Graphics();
  const cx = COSMETIC_FRAME / 2; // 32 — body is horizontally centred in its frame
  switch (spec.shape) {
    case "helm": {
      // A filled arc capping the head (head sits ~y18-26). Breaks the head silhouette.
      g.moveTo(cx - 11, 25)
        .arc(cx, 25, 11, Math.PI, 0, false) // dome over the top of the head
        .lineTo(cx + 11, 25)
        .closePath()
        .fill({ color: spec.color })
        .stroke({ color: spec.accent, width: 2 });
      // A nasal/brow band so the tier shape reads even at 64px.
      g.rect(cx - 11, 23, 22, 3).fill({ color: spec.accent });
      break;
    }
    case "chestBand": {
      // A trim band across the torso (~y32-40) that visibly bulks the chest.
      g.rect(cx - 9, 33, 18, 8).fill({ color: spec.color }).stroke({ color: spec.accent, width: 2 });
      g.rect(cx - 2, 33, 4, 8).fill({ color: spec.accent }); // central clasp
      break;
    }
    case "cape": {
      // A back drape behind the torso (drawn lower/right so it peeks past the body edge).
      g.moveTo(cx + 6, 30).lineTo(cx + 13, 48).lineTo(cx + 2, 46).closePath()
        .fill({ color: spec.color, alpha: 0.92 }).stroke({ color: spec.accent, width: 1 });
      break;
    }
    case "auraRing": {
      // A soft glow ring behind the pet — the one place a colored glow is OK (clearly an FX).
      g.circle(cx, 40, 22).stroke({ color: spec.color, width: 3, alpha: 0.55 });
      g.circle(cx, 40, 16).stroke({ color: spec.accent, width: 2, alpha: 0.35 });
      break;
    }
  }
  return g;
}

type FrameCache = Map<AnimationName, Texture[]>;
```

### Package B — Mood ladder + line fix  · review: **reject**
probe 2

**Required fixes (from review):**
- Submit a real proposal: concrete file paths (apps/app/src/render/renderer-pixi.ts and/or compositor.ts), real anchor locations, and actual code in 'after'.
- Mood ladder: add a pure status→overlay mapping in compositor.ts (e.g. extend buildScene's status layer to emit grayscale rungs by liveness) plus a STATUS_SHEETS entry and renderer applyLayer/statusOverlay support in renderer-pixi.ts; honor reduced-motion. Must NOT modify cosmeticForLayer (owned by A) or the scene-prop branch of buildScene (owned by C).
- Line fix: make the ground pad integer/gap-free in applyGround/placeSprite (e.g. Math.round/Math.floor on PAD_W/PAD_H/tile positions and feet line) and confirm the vertical seam disappears at 1x and 2x.
- Keep packages/engine untouched (it is CI-purity-enforced) and confirm no prompt/code-text field is introduced.
- Re-run 'pnpm run ci' on the actual diff and report it green before resubmitting.

**`a`** — b: c

### Package C — Share-card + matrix + workKind  · review: **accept-with-fixes**
Package C wires three things through the EXISTING single compositor/layer stack, with zero overlap into the cosmetic-resolution work (package B): (1) a real offscreen PNG share card — `renderSceneToImage(scene, opts)` added to the `Renderer` seam and implemented in renderer-pixi.ts by building a TRANSIENT, off-stage slot that reuses the same `applyLayer`/`applyGround`/`placeSprite` code paths, rendering it into a `RenderTexture`, and extracting a base64 PNG via Pixi v8 `renderer.extract` — and `buildShareCard()` upgraded from a stub returning `image:null` to an async fn returning a data-URL PNG; (2) `viewSignature` extended to include `workKind` so a pure work-zone swap (read→edit, same status/activity/equipped) actually re-pushes the scene through PixiStage's dedupe instead of being dropped; (3) a `?harness` matrix mode crossing every zone (via workKind) AND every equipped-cosmetic id against idle/run/work/death, so G2/G5/G6 alignment is eyeballable in one screen and the share-card export is verifiable in-app. All honor engine purity (no engine edits), structural privacy (workKind is a category enum already on the client view), and the one-compositor rule. Confirmed against Pixi 8.18.1: `RenderTexture.create({width,height,resolution})`, `app.renderer.render({container,target,clearColor})`, and `app.renderer.extract.base64({target,format:'png'})` are the exact v8 signatures (verified from node_modules type declarations).

**Required fixes (from review):**
- Render the DevHarness.tsx and PixiStage.tsx edits as concrete before/after diffs (matching the format used for the other files) rather than prose-in-comments, so the implementer applies exact code. In particular spell out: PixiStage HUNK 2 inserts `onCompositorReady?.(local);` between `compositorRef.current = local;` and `setReady(true);` (PixiStage.tsx:82-83), and the DevHarness useRef/useState additions plus matrixCreatures construction and the two buttons.
- Confirm with the integrator that no other in-flight package (A) edits PixiStage.tsx's boot effect or props signature; if so, coordinate the optional-prop addition to avoid a merge collision (the proposal already self-flags this).
- State explicitly in the PR that the matrix's cosmetic columns render empty until package B's COSMETIC_SHEETS preload lands, so reviewers do not mistake empty armor layers for a package-C export bug. The Export PNG / work-zone-swap / leak acceptance checks are independently verifiable now; the cosmetic-on-body check is gated on B.

**New assets/crops:** No new atlas crops or commissioned sheets are introduced by package C. The share-card export and the matrix REUSE existing CHARACTER_SHEETS + SCENE_SHEETS already preloaded; cosmetic layers in the matrix render whatever the (package-B) cosmeticForLayer + COSMETIC_SHEETS produce, with no art owned here.; Share-card background is a procedural solid fill (default 0x10141c dark card, configurable; transparent 0x00000000 by default for compositing) passed as `clearColor` to renderer.render — a colour param on RenderImageOptions, not an asset.

**`apps/app/src/render/compositor.ts`** — viewSignature() — lines 226-228: Include workKind in the rendered-content signature so a pure work-zone swap (read→edit, same status/activity/equipped) re-pushes the scene through PixiStage's viewSignature-based dedupe. zoneForView/statusToAnimation both branch on workKind, but viewSignature omits it, so PixiStage's `sig` (line 65) can be byte-identical across a zone change and the showAll effect (keyed on `sig`, line 120) never fires — the boulder→tree swap is silently dropped. This is the single load-bearing fix the work package names.
```ts
export function viewSignature(view: CreatureView): string {
  return [
    view.species,
    view.status,
    view.activity,
    view.alive,
    view.equipped.join(","),
    view.tint ?? "-",
    view.seed ?? "-",
    view.workKind ?? "-",
  ].join("|");
}
```
**`apps/app/src/render/compositor.ts`** — Renderer interface — lines 96-101: Add a renderer-agnostic offscreen export to the seam so the share card renders through the SAME compositor/layer stack as the live creature and leaderboard avatars (never fork the stack). The compositor stays Pixi-free: it only declares the contract (RenderImageOptions is plain TS; Promise<string> is a JS built-in — no DOM/Pixi import). Returns a PNG data URL string (consumable by <img src>, download, clipboard); the renderer owns the pixels.
```ts
/** Options for an offscreen scene export (the share card). */
export interface RenderImageOptions {
  /** The account avatar uses the bulkier armoured body + its own feet line (see placeSprite). */
  isPlayer?: boolean;
  /** Device-pixel multiplier for a crisp export (2 ⇒ a 192px-cell card). Default 2. */
  resolution?: number;
  /** Background fill behind the diorama. Default transparent (0x00000000). A solid card
   * colour (e.g. 0x10141c) reads better when shared on light surfaces. */
  background?: number;
}

/** Minimal renderer contract. Implemented by renderer-pixi.ts. */
export interface Renderer {
  /** Apply one keyed scene per creature (player first), laid out in `columns` columns. */
  applyScenes(items: RenderItem[], columns: number): void;
  /** Render a SINGLE scene to a PNG data URL, off-stage, through the same layer stack as the
   * live menagerie (one compositor — never a second draw path). Async: Pixi's pixel read-back
   * resolves a Promise. */
  renderSceneToImage(scene: Scene, opts?: RenderImageOptions): Promise<string>;
  destroy(): void;
}
```
**`apps/app/src/render/compositor.ts`** — Compositor class — insert after showAll(), before destroy() (~line 271): Expose the offscreen export at the orchestrator level so callers (share-card UI, harness) build a CreatureView and get a PNG without touching the renderer directly. buildScene is applied HERE, guaranteeing the share card uses the identical Scene the live pet would — one stack.
```ts
  /** Render ONE creature view to a PNG data URL through the same layer stack as the live
   * menagerie. The share card and any thumbnail go through this — never a forked draw path. */
  renderToImage(view: CreatureView, opts?: RenderImageOptions): Promise<string> {
    return this.renderer.renderSceneToImage(buildScene(view), {
      isPlayer: view.isPlayer,
      ...opts,
    });
  }

  destroy(): void {
    this.renderer.destroy();
  }
}
```
**`apps/app/src/render/renderer-pixi.ts`** — imports — lines 12-14: Pull in RenderTexture (v8 offscreen target) plus the Scene + RenderImageOptions types. Only RenderTexture is a new value import from pixi.js; Scene/RenderImageOptions merge into the existing `import type {...}` from ./compositor. renderer-pixi remains the ONLY Pixi importer.
```ts
import { AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, RenderTexture, Texture, TilingSprite } from "pixi.js";
import type { AnimationName, Layer, RenderImageOptions, RenderItem, Renderer, Scene } from "./compositor";
import { CELL_PX as CELL, LABEL_PX, LAYER_ORDER } from "./compositor";
```
**`apps/app/src/render/renderer-pixi.ts`** — getOrCreateSlot() — lines 227-275 (refactor to extract a reusable makeSlot helper): Extract the Slot-building body into makeSlot(parent, isPlayer, seed?) so the offscreen export reuses the EXACT same container/shadow geometry without registering a phantom slot or kicking a spawn-walk. getOrCreateSlot keeps the live-only concerns (deadMemory seed, pendingEnter, this.slots registration). makeSlot parents under `parent` (this.root for live; a private off-stage root for an export), seeds per-layer death memory only when given, and sets enter=null/pendingEnter=false so it carries no spawn-walk side effects. This is the core enabler for a leak-free, side-effect-free PNG export that still runs the identical layer stack.
```ts
  /** Build a fresh layer-stack Slot (containers + contact shadow) under `parent`. Used by BOTH
   * the live menagerie (parent = this.root) and the offscreen share-card export (parent = a
   * private root). `seed` pre-loads per-layer death memory so a returning-from-death pet plays
   * the get-up; an export passes none. Carries no this.slots / pendingEnter side effects. */
  private makeSlot(parent: Container, isPlayer: boolean, seed?: Map<Layer, AnimationName | null>): Slot {
    const container = new Container();
    parent.addChild(container);
    const layerContainers = new Map<Layer, Container>();
    const layerSprites = new Map<Layer, AnimatedSprite | null>();
    const layerAnim = new Map<Layer, AnimationName | null>();
    const layerKey = new Map<Layer, string | null>();
    for (const layer of LAYER_ORDER) {
      const c = new Container();
      container.addChild(c);
      layerContainers.set(layer, c);
      layerSprites.set(layer, null);
      layerAnim.set(layer, seed?.get(layer) ?? null);
      layerKey.set(layer, null);
    }
    // A soft contact shadow under the feet. Parented at index 1 — above the ground container
    // (layer 0) so it lands ON the floor, but below the scene prop and the pet body, so they
    // occlude it naturally. Drawn once.
    const shadow = new Graphics();
    shadow.ellipse(CELL / 2, GROUND_Y, CELL * 0.26, CELL * 0.085).fill({ color: 0x000000, alpha: 0.2 });
    shadow.ellipse(CELL / 2, GROUND_Y, CELL * 0.16, CELL * 0.05).fill({ color: 0x000000, alpha: 0.18 });
    container.addChildAt(shadow, 1);
    return {
      container,
      layerContainers,
      layerSprites,
      layerAnim,
      layerKey,
      groundTile: null,
      shadow,
      isPlayer,
      enter: null,
      pendingEnter: false,
    };
  }

  private getOrCreateSlot(key: string): Slot {
    const existing = this.slots.get(key);
    if (existing) return existing;

    // If this key is RETURNING from death (was removed while dead), seed its last-animation
    // memory so applyLayer detects the death → alive transition and plays the get-up.
    const remembered = this.deadMemory.get(key);
    this.deadMemory.delete(key);
    const slot = this.makeSlot(this.root, false, remembered);
    // A pet that spawns after boot (not the player, not returning from death) runs in from
    // the player's cell. The player and revived pets just appear in place.
    slot.pendingEnter = this.booted && key !== "player" && !remembered;
    this.slots.set(key, slot);
    return slot;
  }
```
**`apps/app/src/render/renderer-pixi.ts`** — PixiRenderer — new renderSceneToImage method, insert after applyGround() and before destroy() (~line 415): Implement the offscreen PNG export, addressing the architect's 'detached RenderTexture' risk head-on: do NOT hand-build a parallel layer path. Construct a transient Slot via makeSlot under a private off-stage root (NOT this.root, so it never appears on the live canvas), drive it through the EXACT existing applyLayer/applyGround/placeSprite code, freeze each AnimatedSprite on frame 0 (deterministic static card — a paused sprite still draws its current texture), render the detached subtree into a RenderTexture via app.renderer.render({container, target, clearColor}) (v8 runs the render-group update on the passed container, so an off-stage root still gets valid world transforms), read it back with app.renderer.extract.base64({target, format:'png'}), and destroy the RenderTexture (rt.destroy(true)) + offRoot ({children:true}) in a finally so nothing leaks. resolution scales the readback for a crisp 2x card. If a blank PNG ever appears at apply time, the documented remedy is to ensure the container is passed to render({container}) (already done) — never add it to app.stage.
```ts
  /**
   * Render ONE scene to a PNG data URL, OFF-STAGE, reusing the live layer stack so the share
   * card can never drift from the in-app creature. A transient Slot is built under a private
   * root (NOT this.root, so it never shows on the live canvas); the same applyLayer/applyGround/
   * placeSprite paths fill it. We render that detached subtree into a RenderTexture and read it
   * back as base64. Everything transient is destroyed in `finally` (no RenderTexture leak).
   */
  async renderSceneToImage(scene: Scene, opts: RenderImageOptions = {}): Promise<string> {
    const resolution = opts.resolution ?? 2;
    const background = opts.background; // undefined ⇒ transparent

    // A private, off-stage root holding exactly one creature's layer stack.
    const offRoot = new Container();
    const slot = this.makeSlot(offRoot, opts.isPlayer ?? false);

    // Drive the transient slot through the SAME draw code as the live menagerie. No spawn-walk
    // (enter stays null), no booted gating — this is a one-shot static frame.
    for (const layer of LAYER_ORDER) {
      const view = scene[layer];
      this.applyLayer(slot, layer, view.sprite, view.animation, view.tint);
    }
    // Freeze every animated layer on its first frame so the export is deterministic (no
    // half-swing). A paused AnimatedSprite still draws its current texture.
    for (const sprite of slot.layerSprites.values()) {
      if (sprite) sprite.gotoAndStop(0);
    }

    const rt = RenderTexture.create({ width: CELL, height: CELL, resolution });
    try {
      this.app.renderer.render({
        container: offRoot,
        target: rt,
        clearColor: background ?? 0x00000000,
      });
      return await this.app.renderer.extract.base64({ target: rt, format: "png" });
    } finally {
      rt.destroy(true);
      offRoot.destroy({ children: true });
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true, texture: false });
  }
}
```
**`apps/app/src/render/sharecard.ts`** — imports + ShareCardResult + buildShareCard() — lines 10, 18-32: Replace the `image: null` stub with a real async export rendering the share scene to a PNG data URL through the compositor (one stack). buildShareCard stays a thin renderer-aware orchestrator: still returns the pure Scene + caption (cheap, sync-usable for a preview skeleton) but adds a real image via the passed Compositor — taking a Compositor (not a fresh renderer) so the caller reuses the live Pixi Application (one WebGL context budget). Top import gains Compositor as a value (the rest stay type-only).
```ts
import { buildScene, Compositor, type CreatureView, type Scene } from "./compositor";

export interface ShareCardInput {
  creature: CreatureView;
  score: number;
  rank?: number;
}

export interface ShareCardResult {
  scene: Scene;
  caption: string;
  /** A real PNG data URL rendered offscreen through the SAME compositor/layer stack. */
  image: string;
}

/** Build the share card: the pure Scene + caption, plus a real PNG exported through the
 * compositor (one stack — no forked draw path, no second Pixi Application). Async because the
 * offscreen pixel read-back resolves a Promise. */
export async function buildShareCard(input: ShareCardInput, compositor: Compositor): Promise<ShareCardResult> {
  const image = await compositor.renderToImage(input.creature, { resolution: 2, background: 0x10141c });
  return {
    scene: buildScene(input.creature),
    caption: `${input.creature.species} • score ${input.score}${input.rank ? ` • #${input.rank}` : ""}`,
    image,
  };
}
```
**`apps/app/src/PixiStage.tsx`** — PixiStage props signature (line 38) AND the boot effect after `compositorRef.current = local` (line ~82): Surface the live Compositor via an OPTIONAL callback prop so the harness (and a future share UI) call renderToImage on the already-running renderer instead of booting a second Pixi Application. Purely additive and backward-compatible — App.tsx and the existing harness path pass nothing and are unaffected. This is the ONLY edit outside package C's two named target files; it is the minimal seam to reuse the single Application for the in-app PNG export. Apply BOTH hunks below in this file.
```ts
// HUNK 1 — props:
export function PixiStage({
  creatures,
  onCompositorReady,
}: {
  creatures: Creature[];
  /** Optional: receives the live Compositor once the renderer boots, so callers can export a
   * share-card PNG through the SAME stack (no second Pixi Application). */
  onCompositorReady?: (compositor: Compositor) => void;
}) {
// HUNK 2 — in the boot effect, replace `local = new Compositor(renderer); compositorRef.current = local; setReady(true);`
// with the same three lines plus `onCompositorReady?.(local);` between the assignment and setReady(true):
//   local = new Compositor(renderer);
//   compositorRef.current = local;
//   onCompositorReady?.(local);
//   setReady(true);
```
**`apps/app/src/DevHarness.tsx`** — DevHarness component — add matrix mode + PNG export (G5/G6/V5 test surface): Add a harness 'matrix' toggle that crosses every WorkKind/zone AND every equipped-cosmetic id against the pose set (driven by the existing alive/dead + working toggles) so a designer eyeballs alignment + the work-zone swap in one screen — the dedicated cosmetic+zone matrix G5 asks for and the surface package B's cosmetic art is verified through. The matrix passes `equipped` arrays STRAIGHT THROUGH (no tier resolution here), so it stays independent of package B's cosmeticForLayer change: whatever B returns, the matrix renders. Distinct workKind per row exercises the viewSignature fix (distinct signature ⇒ distinct zone). Plus an 'Export PNG' button calling buildShareCard via the live Compositor (surfaced through PixiStage's new onCompositorReady) and showing the data-URL <img> — the V5 'real PNG via same stack' acceptance, in-app. All additive; the existing lifecycle harness is untouched and shown when matrix is off.
```ts
import { useRef, useState } from "react";
import { PixiStage, type Creature } from "./PixiStage";
import { buildShareCard } from "./render/sharecard";
import {
  Compositor,
  tintForSeed,
  workingAnimation,
  WORKING_ANIMATIONS,
  WORK_KINDS,
  type AnimationName,
  type CreatureView,
} from "./render/compositor";

// MATRIX cosmetic sets — passed straight through `equipped` (tier resolution lives in the
// compositor; this harness stays agnostic to how cosmeticForLayer resolves them).
const COSMETIC_SETS: { label: string; equipped: string[] }[] = [
  { label: "bare", equipped: [] },
  { label: "bronze", equipped: ["helm.bronze"] },
  { label: "iron+scribe", equipped: ["helm.iron", "armor.scribe"] },
  { label: "full", equipped: ["helm.iron", "armor.scribe", "aura.streak"] },
];
// In the body of DevHarness add these hooks beside the existing useState calls:
//   const [matrix, setMatrix] = useState(false);
//   const [cardSrc, setCardSrc] = useState<string | null>(null);
//   const compositorRef = useRef<Compositor | null>(null);
// and build the matrix creature list (one pet per workKind × cosmetic-set):
//   const matrixCreatures: Creature[] = WORK_KINDS.flatMap((wk) =>
//     COSMETIC_SETS.map((cs): Creature => {
//       const seed = `mx-${wk}-${cs.label}`;
//       const dead = life === "dead";
//       const view: CreatureView = {
//         species: "knight",
//         status: dead ? "dead" : "lively",
//         activity: working && !dead ? "active" : "idle",
//         alive: true,
//         equipped: cs.equipped,
//         tint: tintForSeed(seed),
//         seed,
//         workKind: wk,
//       };
//       return { key: seed, view, name: wk, sub: cs.label };
//     }),
//   );
// In the hud, add two buttons:
//   <button style={btn} onClick={() => setMatrix((m) => !m)}>{matrix ? "← lifecycle view" : "cosmetic × zone matrix"}</button>
//   <button style={btn} onClick={async () => {
//     const c = compositorRef.current; if (!c) return;
//     const view: CreatureView = { species: "knight", status: "lively", activity: "idle", alive: true, equipped: ["helm.iron", "armor.scribe"], seed: "card", isPlayer: true };
//     const card = await buildShareCard({ creature: view, score: 12345, rank: 3 }, c);
//     setCardSrc(card.image);
//   }}>Export PNG</button>
// Replace the stage render with the matrix-aware one + the export preview:
//   <PixiStage creatures={matrix ? matrixCreatures : creatures} onCompositorReady={(c) => (compositorRef.current = c)} />
//   {cardSrc ? <img src={cardSrc} alt="share card export" style={{ position: "fixed", right: 12, bottom: 12, width: 192, imageRendering: "pixelated", border: "1px solid #333" }} /> : null}
```
