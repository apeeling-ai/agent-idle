# Sprite & art assets

The art here is **not** covered by the repository's AGPL-3.0 code license — each pack keeps its
own license. See the repo-root [`ATTRIBUTION.md`](../ATTRIBUTION.md) for the full table.

| Folder | Pack | License summary |
|---|---|---|
| `Entities/`, `Environment/`, `Icons/`, `Weapons/` | **Pixel Crawler** (Anokolisa) | Any project use allowed, attribution optional; only restriction is you may not resell the assets as a standalone pack. See [`Terms.txt`](Terms.txt). |
| `generated/` | Baked from Pixel Crawler `Environment/` | Same as above — rebuild with `python3 scripts/bake-world-scene.py`. |
| `lpc/` | Liberated Pixel Cup (generator) | CC0 / CC-BY / CC-BY-SA / GPL (per asset) — attribution required, see [`lpc/CREDITS.md`](lpc/CREDITS.md). |
| `UI/` | Original project art (status bubbles) | AGPL-3.0 (project art). |

## Rebuilding baked art

- **World diorama** (`generated/`): `python3 scripts/bake-world-scene.py` (needs Pillow:
  `pip install pillow`). Composites from `Environment/`.
- **LPC player gear** (`lpc/`): `scripts/bake-player-assets.py` from a local LPC generator clone
  — see [`lpc/CREDITS.md`](lpc/CREDITS.md).
