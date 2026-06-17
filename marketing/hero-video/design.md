# Agent Idle — Design System (hero video)

The brand is a mossy-green / coin-gold pixel-crawler. Lift the palette straight from the
app's `theme.css`. This is a retro pixel-game look: dark ink backgrounds, chunky pixel
display type, coin-gold for the headline numbers, moss-green for the world.

## Mood

Cozy, ambient, idle-game. Playful but legible. Motion is snappy and a little springy —
think 8-bit overworld, not corporate keynote. Energy peaks on the "tokens mined" beat.

## Colors (Palette)

Backgrounds / ground:
- `#141a12` — ink (primary background)
- `#1a2117` — ink-2 (panel / secondary background)
- `#11160f` — panel-solid (deepest)

World greens:
- `#8bd450` — moss (the world, accents)
- `#6fae42` — moss-dim
- `#2c3a24` — edge (borders)
- `#232c1e` — edge-soft

Gold (headline + coins):
- `#ffd166` — gold (the headline / coin number)
- `#f2b705` — gold-deep
- `rgba(242,183,5,0.55)` — gold-shadow (glow)

Text:
- `#cdd6c2` — parch (body text)
- `rgba(205,214,194,0.6)` — parch-dim

Ember (forge / gear):
- `#ff8c42` — ember
- `#f2660a` — ember-deep

Per-action room colors (the diorama rooms):
- `#d7a85a` — shell / the mine (Bash & tests)
- `#8bd450` — edit / the lumber yard (Edit & Write)
- `#5ac9b0` — read / the grove+pond (Read & Grep)
- `#5aa9d7` — web / the pond (WebFetch & Search)
- `#b189d7` — thinking (arcane violet)
- `#46523c` — idle / the camp

Accent for negatives only: `#e06a52` — alert.

## Typography

- **Display / pixel garnish:** `"Press Start 2P"` — wordmark, eyebrows, big numerals, short
  punchy titles ONLY. Never body copy (it's unreadable at length). Local file at
  `fonts/press-start-2p.woff2`.
- **Everything else (headlines, body, code):** `"JetBrains Mono"` — 400 / 500 / 700. Local
  files at `fonts/jetbrains-mono-{400,500,700}.woff2`.

`@font-face` declarations point at the local files (added in the composition `<style>`).

## Corners & depth

- Corners: small radius (4–10px) or square. Pixel UI is blocky — avoid big pill radii.
- Depth: flat fills + localized gold/moss glows. NO full-screen gradients (H.264 banding).
  Glow = radial gradient or `box-shadow` behind a single element.
- Optional 2px chunky borders in `edge` / `moss` to read like game UI panels.

## Motion

- Snappy, slightly springy entrances: `back.out(1.7)`, `power3.out`, `expo.out`.
- Pixel things "pop" in (scale from 0.8 + small overshoot), they don't ease gently.
- Coins/tokens fly with `power2.in` arcs. Numbers count up.
- Vary at least 3 eases per scene.

## What NOT to do

- No `#333`, `#3b82f6`, `Roboto`, `Inter`, or any color/font outside this file.
- No full-screen linear gradients on the dark background.
- No Press Start 2P for paragraphs or long lines.
- No smooth "luxury" slow fades — this is a game, keep it lively.
