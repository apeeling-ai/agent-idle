# Attribution & third-party licenses

Agent Idle's **source code** is licensed under **AGPL-3.0-only** (see [`LICENSE`](LICENSE)).

The **bundled art and audio assets keep their own, separate licenses** — they are *not*
covered by the AGPL. This file lists every third-party asset that ships in the repository,
who made it, the license it is under, and the obligations that come with it. If you fork or
redistribute Agent Idle, you are responsible for honouring these terms.

> **Status — read before publishing.** One item below is still unresolved (LPC credits
> reconciliation) and is called out inline as **⚠️ ACTION REQUIRED**.

---

## Sprite & art assets

| Folder | Source | Author(s) | License | Notes |
|---|---|---|---|---|
| `sprites/Entities/`, `sprites/Environment/`, `sprites/Icons/`, `sprites/Weapons/` | **Pixel Crawler** pack | Anokolisa | Anokolisa asset license — see [`sprites/Terms.txt`](sprites/Terms.txt) | Any project use permitted, attribution optional. Only restriction: you may not resell the assets as a standalone pack. |
| `sprites/generated/` | Derived (baked from Pixel Crawler `Environment/`) | Anokolisa (base art) | Same as above | Built by `scripts/bake-world-scene.py`; explicitly allowed (Terms 2, 3.3) |
| `sprites/UI/` | Original project art (status bubbles) | Agent Idle | AGPL-3.0 (project art) | — |
| `sprites/lpc/` | **Liberated Pixel Cup** via the [Universal LPC Spritesheet Character Generator](https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator) | Multiple (see [`sprites/lpc/CREDITS.md`](sprites/lpc/CREDITS.md)) | Per-asset mix of **CC0 / CC-BY 3.0+ / CC-BY-SA 3.0+ / GPL-3.0** | Attribution required; ⚠️ reconcile credits (below) |

### Pixel Crawler — permissive asset license

The Pixel Crawler license ([`sprites/Terms.txt`](sprites/Terms.txt)) is permissive:

- **Use in any project is allowed without restriction** (Terms 1.5, 4) — commercial or not, and
  regardless of how the assets were acquired (4.1).
- **Attribution is optional** (1.1); the author may even request removal from credits (1.3).
- **Modification is allowed** (2); assets *made using* the art as a base may be sold (3.3).
- **The only prohibition:** you may **not sell or market the assets themselves as a final product**
  — i.e. repackage and resell Anokolisa's art pack as an art pack (2.1, 3).

Agent Idle uses the art inside the app, not as a sellable asset pack, so this use is fully
permitted and the files are committed normally. (Edge note: Terms 3.4 asks that *tools* built for
game development — character creators, tile customizers, level generators — inform the author
before being **sold**; a desktop pet is not such a tool.) Supporting the author by buying the pack
is appreciated: <https://www.patreon.com/Anokolisa>.

### ⚠️ ACTION REQUIRED — LPC credits reconciliation

The LPC layers are redistributable, but CC-BY/CC-BY-SA/GPL require **accurate per-author
attribution** (and CC-BY-SA/GPL add share-alike / source obligations). `sprites/lpc/CREDITS.md`
lists contributors but is marked non-exhaustive. Before publishing: export the generator's
`CREDITS.csv` for the exact layers shipped here and reconcile `CREDITS.md` against it so every
required author is credited.

## Audio assets

| File | Source | License | Notes |
|---|---|---|---|
| `apps/app/public/sounds/work-work.wav` | **Original** — "work, work" voice synthesized with [eSpeak NG](https://github.com/espeak-ng/espeak-ng) (open-source TTS), pitched/processed with ffmpeg | AGPL-3.0 (project asset) | Generated for this project; eSpeak NG output carries no licensing encumbrance. Replaces an earlier Warcraft III placeholder. |

## Fonts

| Font | How it's loaded | License |
|---|---|---|
| JetBrains Mono | Google Fonts (loaded at runtime, **not** bundled) | OFL-1.1 |
| Press Start 2P | Google Fonts (loaded at runtime, **not** bundled) | OFL-1.1 |

Fonts are fetched from Google Fonts at runtime and are not committed to the repo, so they
carry no in-repo redistribution obligation.

## Code dependencies

All direct runtime dependencies are under permissive licenses (MIT / ISC / Apache-2.0):
React, PixiJS, Convex, `@convex-dev/auth`, `@auth/core`, Turbo, TypeScript, Vite, Tauri.
No copyleft code dependencies are bundled. Run `pnpm licenses list` for the full resolved tree.
