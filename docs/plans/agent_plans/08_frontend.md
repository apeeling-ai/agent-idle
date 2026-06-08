# Agent 08 — Front End

> Greenfield (our own app code, standard frameworks). Owns everything seen and
> touched: the layered creature renderer, the desktop window, the phone app, board
> screens, and the share card — all from one web codebase.

---

## 1. Mandate

Render the creature and the world, handle input, and ship the same UI to desktop and
phone. Build the one compositor that draws the live creature, the leaderboard avatar,
and the share card identically.

## 2. Tech (ratified with Research)

- **Renderer:** plain Canvas for the single-sprite v1; **PixiJS** as cosmetics/zones
  multiply (lightweight WebGL renderer, fast sprite batching — it *is* our renderer
  layer, not a competing framework). **Phaser** reserved for Path B zone minigames.
- **Desktop shell:** **Tauri 2** — frameless, transparent, always-on-top, ~8MB.
- **Mobile shell:** **Capacitor** wrapping the same web UI (later).
- **UI chrome:** React for panels, settings, board screens; the canvas is the world.

## 3. The compositor (the heart of Front End)

`renderer/compositor.ts` stacks z-ordered layers:
```
base species → body (armor) → head (helmet/crown) → aura → status overlay
```
- Each cosmetic = an art asset + a `{ layer, zIndex }` rule (rules from Progression).
- **One compositor renders three surfaces:** live creature, board avatar, share card.
  Never fork it — a Context Lord must look identical everywhere.
- Build it in Phase 1 even with a single base sprite, so the pipeline exists before
  there's art to fill it.

## 4. The desktop window (Tauri specifics)

Budget for the known transparent-window work (per Research):
- Frameless + transparent + always-on-top + visible-on-all-workspaces config.
- **Mouse passthrough:** `set_ignore_cursor_events` so clicks on empty (transparent)
  pixels reach the app behind; clicks on the creature hit the creature.
- **macOS alpha=0 quirk:** clicking a fully transparent pixel misbehaves — apply the
  documented workaround.
- **Multi-monitor:** remember and restore which monitor/corner the creature lives on.
- No window shadow/border; CSS must not paint a solid background or transparency
  breaks.

## 5. The share card (`sharecard.ts`) — the viral loop

- Renders, via the same compositor, an image of: creature + equipped armor + rank/
  percentile (data from Leaderboards) + a small brand mark.
- Exports a clean raster image sized for social timelines (looks good *small*).
- One tap from seeing your creature/rank to a generated, shareable image (flow owned
  with UX/Social).
- This is the single most important growth feature Front End ships; treat it as P6
  launch-critical, not a nicety.

## 6. Mobile (Capacitor)

- Wrap the same renderer + React UI; touch-first input (big targets, no hover).
- Reads the same backend over the same socket; shows the creature the laptop fed.
- App-store packaging is calendar time, not code time — budget review/provisioning.

## 7. Performance & comfort

- Cap frame rate sensibly; an always-on-screen pet must be light on CPU/GPU/battery
  (especially on the second monitor and on phones).
- Honor reduced-motion (UX requirement) — degrade animation gracefully.
- Colorblind-safe state cues come from UX; render posture/icon, not color alone.

## 8. Phased delivery

- **P1:** Tauri window + compositor (single sprite) + click-to-feed; local state.
- **P2:** wire cosmetics → compositor shows earned gear from local stats.
- **P3:** reflect sensor-driven feeds live.
- **P4:** talk to the cloud backend; live pushes update the creature.
- **P5:** Capacitor mobile wrap.
- **P6:** board screens + the share card rendering real rank data.

## 9. Interfaces & handoffs

- **Consumes:** Engine (state to render), Progression (cosmetic rules + tiers),
  Networking (live updates), Leaderboards (board data + rank for the card), UX (the
  interaction model, mood map, comfort rules).
- **Produces:** the compositor, the desktop window, the React UI, the Capacitor wrap,
  the share card.

## 10. Risks

- **Transparency/passthrough pitfalls** (esp. macOS) → budgeted, use documented fixes.
- **Compositor fork** for the board/card → forbidden; one compositor only.
- **Battery/CPU drain** from an always-on animation → strict perf budget.
- **App-store delay** → plan around review windows, not around coding speed.

## 11. Open decisions surfaced

- React Native vs Capacitor if a more native mobile feel is later wanted.
- Canvas → PixiJS migration trigger (define the sprite-count threshold).

## 12. Definition of done

A clickable, armored creature lives transparent on the second monitor with correct
passthrough; the same renderer runs on a phone; board avatars and the share card use
the *same* compositor; the share card exports a clean, timeline-ready image.

## 13. First three tasks

1. Build the layered compositor with one base sprite and a fake cosmetic to prove
   layering.
2. Stand up the Tauri window with transparency + passthrough working on Win + macOS.
3. Wire click-to-feed through the engine and render the resulting mood change.
