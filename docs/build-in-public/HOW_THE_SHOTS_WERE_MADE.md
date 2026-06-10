# How the screenshots were captured

No Playwright needed — headless Chrome renders the gallery's CSS sprites fine.

## What worked: capture the gallery, then crop

The `?gallery` route renders every asset via **CSS** (`gallery/Sprite.tsx`), so it
screenshots reliably headless. The live overlay (`App.tsx` / `?harness`) draws PixiJS
sprites on a *transparent* background with async texture loads — a static headless shot
comes up mostly empty (only the DOM labels render). So: shoot the gallery tall, crop the
good regions.

```bash
nvm use 22
( cd apps/app && ./node_modules/.bin/vite --port 5199 --strictPort & )
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Full gallery, tall window. --headless=new + --virtual-time-budget lets async loads finish.
# NOTE: quote the ?gallery URL — zsh treats ? as a glob ("no matches found" otherwise).
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --virtual-time-budget=4000 --window-size=1500,5200 \
  --screenshot=/tmp/gallery-full.png "http://localhost:5199/?gallery"
```

Then crop regions with PIL (coords are for a 3000×10400 capture; re-measure if you resize):

```python
from PIL import Image
im = Image.open("/tmp/gallery-full.png")
im.crop((40, 300, 2120, 1010)).save("shots/02-hero-mining.png")        # "Pick & choose" combiner
im.crop((30, 7190, 2965, 7870)).save("shots/03-zones.png")             # Zones row
im.crop((0, 1000, 3000, 2450)).save("shots/04-creature-animations.png")# Worker action set
```

The vision doc and the baked map are direct:
```bash
"$CHROME" --headless --force-device-scale-factor=2 --window-size=980,2600 \
  --screenshot=shots/01-origin-idea.png "file://$PWD/docs/promptmon_overview.html"
cp sprites/generated/world_scene.png shots/05-world-scene.png
```

## Dashboard shots (`?dash` dev route, synthetic data)

The stats dashboard takes data as props (App.tsx owns the Convex subscriptions), so it can't
be shot from a logged-out headless browser. `dashboard/DashboardPreview.tsx` feeds it
plausible synthetic data behind a dev-only `?dash` route (same pattern as `?gallery`):

```bash
"$CHROME" --headless=new --force-device-scale-factor=2 --virtual-time-budget=5000 \
  --window-size=1100,1700 --screenshot=/tmp/dash.png "http://localhost:5199/?dash"
# tabs: ?dash=history  ?dash=leaderboard   (Dashboard gained an optional initialTab prop)
```
Crop the top region with PIL (overview ≈ 1180px, history ≈ 1260px, leaderboard ≈ 560px tall
at scale 2). The synthetic numbers live in `DashboardPreview.tsx` — tweak `day()`, the day
count, or `YOU_TOKENS` to restage the story. The route is gated by `import.meta.env.DEV`, so
it never ships; delete the file + the `?dash` branch in `main.tsx` if you don't want it.

## To capture the LIVE overlay or HISTORICAL builds (follow-up)

The strongest "journey" visual is a before/after of the live overlay: floating pets
(`a958bea`, Jun 6) → grounded diorama (`790457d`, Jun 10). Walk it in a worktree:

```bash
git worktree add /tmp/ai-hist a958bea
cd /tmp/ai-hist && nvm use 22 && pnpm install
pnpm --filter @agent-idle/engine build        # engine is consumed as built JS
( cd apps/app && ./node_modules/.bin/vite --port 5200 --strictPort & )
cd - && git worktree remove /tmp/ai-hist --force
```

Capture the live overlay **non-headless** (a real Vite/Tauri window) after the pet has
spawned, or trigger states via the `?harness` buttons (Start working / Kill / Revive)
and use macOS `screencapture`. Headless won't reliably catch the transparent Pixi canvas.
