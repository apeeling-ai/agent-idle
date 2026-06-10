#!/usr/bin/env python3
"""Build ALL of the player's LPC layers (sprites/lpc/) from the local LPC clone.

This is the SINGLE source for the player avatar's art — no network fetch. It needs the LPC
generator cloned next to this repo:
    ../Universal-LPC-Spritesheet-Character-Generator

Three jobs:
  1. COPY the worn tiers that are already usable as-is — armor (cloth→legion) + helm.
  2. COMPOSITE a HEAD into the body (LPC bodies are headless; the head is a separate layer),
     so the avatar has a face. Helmets still sit on top correctly.
  3. BAKE distinct per-tier WEAPONS — most LPC weapons have no held-idle frame, only a `walk`
     sheet whose first south frame IS a clean standing held pose; we lift that into a sheet
     keyed by the engine's weapon rung name.

Run: python3 scripts/bake-player-assets.py   (needs Pillow + the clone). Attribution: CREDITS.md.
"""
import math
import os
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLONE = os.path.join(REPO, "..", "Universal-LPC-Spritesheet-Character-Generator", "spritesheets")
OUT = os.path.join(REPO, "sprites", "lpc")

CELL = 64
SOUTH_Y = 128  # row order N/W/S/E → south at y=128

# Worn tiers copied verbatim (already 128x256 with content in the idle frames). dest → clone src.
COPY = {
    "armor/cloth.png": "torso/clothes/longsleeve/longsleeve/male/idle.png",
    "armor/leather.png": "torso/armour/leather/male/idle.png",
    "armor/chain.png": "torso/chainmail/male/idle.png",
    "armor/plate.png": "torso/armour/plate/male/idle.png",
    "armor/legion.png": "torso/armour/legion/male/idle.png",
    "helm/nasal.png": "hat/helmet/nasal/adult/idle.png",
    "helm/norman.png": "hat/helmet/norman/adult/idle.png",
    "helm/barbuta.png": "hat/helmet/barbuta/male/idle.png",
    "helm/greathelm.png": "hat/helmet/greathelm/male/idle.png",
    "helm/legion.png": "hat/helmet/legion/adult/idle.png",
    # Legs (pants) tiers — cloth trousers → legion skirt; the LEGS layer draws UNDER the torso
    # armor and OVER the bare body (see the app compositor's LAYER_ORDER).
    "legs/cloth.png": "legs/pants/male/idle.png",
    "legs/hose.png": "legs/hose/male/idle.png",
    "legs/studded.png": "legs/leggings2/male/idle.png",
    "legs/greaves.png": "legs/armour/plate/male/idle.png",
    "legs/legion.png": "legs/skirts/legion/male/idle.png",
}

# Distinct weapons per rung — lifted from each weapon's standing south frame. Crude → magical.
WEAPONS = {
    "bronze": "weapon/sword/dagger/walk/dagger.png",
    "iron": "weapon/sword/saber/walk/saber.png",
    "steel": "weapon/sword/longsword/walk/longsword.png",
    "mithril": "weapon/sword/rapier/walk/rapier.png",
    "prismatic": "weapon/sword/glowsword/walk/blue.png",
}


def load(rel):
    return Image.open(os.path.join(CLONE, rel)).convert("RGBA")


def save(img, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print(f"  baked {rel}  {img.size}")


# 1. Worn tiers — straight copy.
for dest, src in COPY.items():
    save(load(src), dest)

# 2. Body + head → one sheet (composites frame-for-frame across all directions/frames).
body = load("body/bodies/male/idle.png")
body.alpha_composite(load("head/heads/human/male/idle.png"))
save(body, "body/idle.png")

# 3. Distinct weapons — standing south frame written into both south idle frames.
for rung, src in WEAPONS.items():
    held = load(src).crop((0, SOUTH_Y, CELL, SOUTH_Y + CELL))
    sheet = Image.new("RGBA", (CELL * 2, 256), (0, 0, 0, 0))
    sheet.alpha_composite(held, (0, SOUTH_Y))
    sheet.alpha_composite(held, (CELL, SOUTH_Y))
    save(sheet, f"weapon/{rung}.png")

# 4. AURA effects — procedural radial glows (LPC has none). Drawn BEHIND the character (see the
#    compositor's LAYER_ORDER), so the body occludes the centre and a coloured halo rings the
#    hero. Brighter / larger per tier. spark (cyan) → flame (orange) → radiant (gold).
AURAS = {
    "spark": ((150, 225, 255), 24, 200),
    "flame": ((255, 150, 60), 29, 225),
    "radiant": ((255, 224, 120), 34, 245),
}
for rung, (rgb, radius, peak) in AURAS.items():
    glow = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    px = glow.load()
    cx, cy = 32, 38  # centred on the torso
    for y in range(CELL):
        for x in range(CELL):
            d = math.hypot(x - cx, y - cy)
            if d < radius:
                a = int(peak * (1 - d / radius) ** 1.6)
                px[x, y] = (rgb[0], rgb[1], rgb[2], a)
    sheet = Image.new("RGBA", (CELL * 2, 256), (0, 0, 0, 0))
    sheet.alpha_composite(glow, (0, SOUTH_Y))
    sheet.alpha_composite(glow, (CELL, SOUTH_Y))
    save(sheet, f"aura/{rung}.png")

print("Done -> sprites/lpc/")
