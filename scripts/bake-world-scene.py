#!/usr/bin/env python3
"""
Bake the ambient world's BACKGROUND SCENE — a lush grass homestead in the Pixel Crawler style.

The world is a grass field with soft dirt/stone clearings for the work zones, a real cabin the
player stands in front of, a fenced graveyard, a pond with a sandy bank, and nature scattered in
natural COPSES (clumps) rather than even noise. We bake it ONCE here into a single 480x360 PNG
that the renderer draws as the backdrop; pets and the animated campfire render on top as live
sprites.

Output: sprites/generated/world_scene.png   (served at /sprites/generated/...)
Run:    python3 scripts/bake-world-scene.py   (needs Pillow + numpy)

Zone clearing CENTERS here must match ZONE_CLUSTER in apps/app/src/render/layout.ts, and PORCH_Y
must match PLAYER_FRAC.y there (the player sprite's feet land on the porch deck).
"""

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, "sprites/Environment")
OUT = os.path.join(ROOT, "sprites/generated")
W, H = 480, 360

flo = Image.open(os.path.join(ENV, "Tilesets/Floors_Tiles.png")).convert("RGBA")
veg = Image.open(os.path.join(ENV, "Props/Static/Vegetation.png")).convert("RGBA")
rocks = Image.open(os.path.join(ENV, "Props/Static/Rocks.png")).convert("RGBA")
tree03 = Image.open(os.path.join(ENV, "Props/Static/Trees/Model_03/Size_02.png")).convert("RGBA")
water_t = Image.open(os.path.join(ENV, "Tilesets/Water_tiles.png")).convert("RGBA")
roofs_b = Image.open(os.path.join(ENV, "Structures/Buildings/Roofs.png")).convert("RGBA")
props_b = Image.open(os.path.join(ENV, "Structures/Buildings/Props.png")).convert("RGBA")
WOOD = Image.open(os.path.join(ENV, "Structures/Buildings/Floors.png")).convert("RGBA").crop((0, 0, 48, 48))

GRASS = flo.crop((16, 160, 32, 176))    # solid green grass fill
STONE = flo.crop((256, 0, 272, 16))     # grey cobble (mine)
DIRT = flo.crop((208, 160, 224, 176))   # warm dirt (paths, lumber, camp, pond bank)
WATER = water_t.crop((16, 184, 32, 200))  # solid blue water


def darken(img, f, blue=1.0):
    """Multiply RGB brightness (keep alpha) — for the somber graveyard ground."""
    r, g, b, a = img.split()
    rgb = ImageEnhance.Brightness(Image.merge("RGB", (r, g, b))).enhance(f)
    r2, g2, b2 = rgb.split()
    b2 = b2.point(lambda v: min(255, int(v * blue)))
    return Image.merge("RGBA", (r2, g2, b2, a))


GRAVE = darken(STONE, 0.66, blue=1.12)  # cool, somber stone — not a black hole


def tile_fill(src, w, h):
    img = Image.new("RGBA", (w, h))
    for y in range(0, h, 16):
        for x in range(0, w, 16):
            img.paste(src, (x, y))
    return img


def soft_clearing(fill, w, h, seed, core=0.34, blur=3, lump=0.13, power=1.5):
    """A terrain patch with a gradual radial falloff so it melts into the grass."""
    patch = tile_fill(fill, w, h)
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w / 2, h / 2
    nx = (xx - cx) / (w / 2)
    ny = (yy - cy) / (h / 2)
    ang = np.arctan2(ny, nx)
    rng = random.Random(seed)
    p1, p2, p3 = rng.random() * 6, rng.random() * 6, rng.random() * 6
    rmax = 0.86 + lump * np.sin(3 * ang + p1) + 0.07 * np.sin(5 * ang + p2) + 0.05 * np.sin(7 * ang + p3)
    r = np.hypot(nx, ny)
    a = np.clip((rmax - r) / (rmax - core * rmax), 0, 1) ** power
    m = Image.fromarray((a * 255).astype("uint8"), "L").filter(ImageFilter.GaussianBlur(blur))
    patch.putalpha(m)
    return patch


scene = tile_fill(GRASS, W, H)


def paste_center(img, cx, cy, target=None):
    (target if target is not None else scene).alpha_composite(img, (int(cx - img.width / 2), int(cy - img.height / 2)))


def paste_bottom(img, cx, by, target=None):
    (target if target is not None else scene).alpha_composite(img, (int(cx - img.width / 2), int(by - img.height)))


def scaled(img, h):
    s = h / img.height
    return img.resize((max(1, int(img.width * s)), max(1, int(h))), Image.Resampling.NEAREST)


def scaled_w(img, w):
    s = w / img.width
    return img.resize((max(1, int(w)), max(1, int(img.height * s)), ), Image.Resampling.NEAREST)


# Pet CLUSTER centers (sprite center) — MUST match ZONE_CLUSTER in apps/app/src/render/layout.ts.
# Each pet faces right (+1); its zone's prop sits PROP_DX to the right at the same ground line so
# the mining swing / chop lands on the boulder / tree instead of empty air.
CLUSTERS = {"mine": (84, 150), "grove": (240, 165), "lumber": (392, 150), "camp": (150, 285), "rest": (336, 285)}
PROP_DX, PROP_DY = 34, 30
HOUSE_CX, PORCH_Y = 240, 128  # PORCH_Y == PLAYER_FRAC.y*H + BASE_SPRITE/2 in layout.ts

# --- worn dirt paths: a hub in the middle linked out to every zone + up to the porch ---
HUB = (240, 232)
path_mask = Image.new("L", (W, H), 0)
pd = ImageDraw.Draw(path_mask)
for name in ("mine", "grove", "lumber", "camp", "rest"):
    cx, cy = CLUSTERS[name]
    pd.line([HUB, (cx + 16, cy + 16)], fill=170, width=13)
pd.line([HUB, (HOUSE_CX, PORCH_Y + 4)], fill=170, width=13)
pd.ellipse([HUB[0] - 18, HUB[1] - 13, HUB[0] + 18, HUB[1] + 13], fill=170)
path_mask = path_mask.filter(ImageFilter.GaussianBlur(3))
path = tile_fill(DIRT, W, H)
path.putalpha(path_mask)
scene.alpha_composite(path)

# --- a pond with a sandy bank in the open left-centre (balances the graveyard on the right) ---
POND = (52, 232)
paste_center(soft_clearing(DIRT, 112, 84, 77, core=0.3, blur=4), POND[0], POND[1])  # bank
paste_center(soft_clearing(WATER, 90, 64, 78, core=0.62, blur=2, lump=0.08, power=1.2), POND[0], POND[1])

# --- work-zone clearings, centered to cover both the pets and their prop ---
CLEAR_FILL = {"mine": (STONE, 11), "lumber": (DIRT, 22), "camp": (DIRT, 33), "rest": (GRAVE, 44)}
for name, (fill, seed) in CLEAR_FILL.items():
    cx, cy = CLUSTERS[name]
    paste_center(soft_clearing(fill, 152, 104, seed), cx + 16, cy + 16)

# --- decoration crops ---
BUSHES = [veg.crop((0, 0, 64, 64)), veg.crop((64, 0, 128, 64))]  # two GREEN bushes
BUSH_AUTUMN = veg.crop((128, 0, 192, 64))  # olive accent
FERN = veg.crop((96, 256, 152, 312))
MUSH = veg.crop((8, 320, 32, 344))
FLOWERS = [veg.crop((0, 352, 16, 368)), veg.crop((0, 384, 16, 400)), veg.crop((0, 400, 16, 416))]  # orange/white/blue
BOULDER_GREY = rocks.crop((96, 16, 144, 80))
BOULDER_BROWN = rocks.crop((0, 16, 32, 64))
ROCK_SM = rocks.crop((16, 96, 32, 112))
HEADSTONE = rocks.crop((176, 64, 192, 84))
TREE = tree03.crop((0, 5, 30, 80))


def prop_at(zone, img, h, dx=PROP_DX, dy=PROP_DY):
    cx, cy = CLUSTERS[zone]
    paste_bottom(scaled(img, h), cx + dx, cy + dy)


# --- the grove: a tree + bushes the gatherers collect from (to their right) ---
gx, gy = CLUSTERS["grove"]
rng = random.Random(7)
prop_at("grove", TREE, 80)
for i in range(3):
    paste_bottom(scaled(BUSHES[i % len(BUSHES)], 40), gx + PROP_DX - 6 + rng.randint(-4, 4), gy + PROP_DY - 22 - i * 12)

# --- mine boulder, lumber tree (campfire stays a live sprite) ---
prop_at("mine", BOULDER_GREY, 50)
paste_bottom(scaled(BOULDER_GREY, 28), CLUSTERS["mine"][0] + PROP_DX + 22, CLUSTERS["mine"][1] + PROP_DY + 4)
prop_at("lumber", TREE, 84)

# --- the graveyard: a cairn flanked by rows of headstones on the somber plot ---
rcx, rcy = CLUSTERS["rest"]
prop_at("rest", BOULDER_BROWN, 40)
rng = random.Random(55)
for col in (-44, -16, 26, 50):
    for row in (-10, 14):
        h = rng.randint(18, 28)
        paste_bottom(scaled(HEADSTONE, h), rcx + PROP_DX + col + rng.randint(-2, 2), rcy + PROP_DY + row)

# --- scatter nature in COPSES (clumps) with open lawn between — reads natural, not noisy ---
rng = random.Random(99)
BLOCK = [(cx + 16, cy + 16, 152, 104) for cx, cy in CLUSTERS.values()]
BLOCK.append((POND[0], POND[1], 130, 100))       # pond + bank
BLOCK.append((HOUSE_CX, PORCH_Y - 56, 124, 150))  # the cabin + porch


def blocked(x, y, pad=2):
    return any(abs(x - bx) < bw / 2 + pad and abs(y - by) < bh / 2 + pad for bx, by, bw, bh in BLOCK)


deco = []  # (y_for_sort, image, x, y)

# clump centres spread across the lawn
clumps = []
tries = 0
while len(clumps) < 12 and tries < 500:
    tries += 1
    cx, cy = rng.randint(24, W - 24), rng.randint(34, H - 18)
    if blocked(cx, cy, 22) or any(math.hypot(cx - px, cy - py) < 46 for px, py, _ in clumps):
        continue
    clumps.append((cx, cy, rng.uniform(20, 36)))

for cx, cy, rad in clumps:
    for _ in range(rng.randint(5, 9)):
        a = rng.uniform(0, math.tau)
        r = rad * math.sqrt(rng.random())
        x, y = int(cx + math.cos(a) * r), int(cy + math.sin(a) * r)
        if blocked(x, y) or not (8 < x < W - 8 and 22 < y < H - 8):
            continue
        roll = rng.random()
        if roll < 0.16:
            img, hh = (BUSH_AUTUMN if rng.random() < 0.25 else BUSHES[rng.randrange(2)]), rng.randint(30, 46)
        elif roll < 0.26:
            img, hh = TREE, rng.randint(56, 84)
        elif roll < 0.36:
            img, hh = FERN, rng.randint(22, 32)
        elif roll < 0.62:
            img, hh = BUSHES[rng.randrange(2)], rng.randint(15, 24)
        elif roll < 0.86:
            img, hh = FLOWERS[rng.randrange(3)], rng.randint(10, 15)
        elif roll < 0.94:
            img, hh = MUSH, rng.randint(11, 16)
        else:
            img, hh = ROCK_SM, rng.randint(10, 15)
        deco.append((y, scaled(img, hh), x, y))

# a handful of standalone landmark trees in the open
for _ in range(6):
    for _try in range(8):
        x, y = rng.randint(20, W - 20), rng.randint(40, H - 16)
        if not blocked(x, y, 14) and all(math.hypot(x - px, y - py) > 40 for px, py, _ in clumps):
            deco.append((y, scaled(TREE, rng.randint(64, 92)), x, y))
            break

# light sprinkle of single flowers on the open lawn for life
for _ in range(22):
    x, y = rng.randint(16, W - 16), rng.randint(40, H - 12)
    if not blocked(x, y, 6):
        deco.append((y, scaled(FLOWERS[rng.randrange(3)], rng.randint(9, 13)), x, y))

# paint back-to-front so nearer decorations overlap farther ones
for _, img, x, y in sorted(deco, key=lambda d: d[0]):
    paste_bottom(img, x, y)

# --- the player's HOUSE: a proper cabin at top-centre; the player stands on the porch deck.
# Baked onto its OWN transparent layer (world_house.png), NOT the scene: the renderer draws it
# as a FOREGROUND overlay (above pets, below the player) so pets can pass behind the cabin and
# be occluded by it. Stack bottom-up: porch deck → plank wall → flanking windows → door → roof. ---
house = Image.new("RGBA", (W, H))
ROOF = roofs_b.crop((0, 6, 128, 75))     # brown gable roof
WALL = roofs_b.crop((28, 158, 100, 212))  # plank wall facade
DOOR = props_b.crop((102, 29, 122, 60))   # closed plank door
WINDOW = props_b.crop((132, 99, 156, 124))  # framed blue window

DECK_DEPTH = 8
WALL_BASE = PORCH_Y - DECK_DEPTH

# porch deck — a wood platform with a dark trim, in FRONT of (below) the cabin
porch = Image.new("RGBA", (112, 22))
for px in range(0, 112, 48):
    porch.paste(WOOD, (px, 0))
ImageDraw.Draw(porch).rectangle([0, 0, 111, 21], outline=(54, 35, 18, 255), width=2)
house.alpha_composite(porch, (HOUSE_CX - 56, WALL_BASE - 4))

wall_s = scaled_w(WALL, 94)               # ~94 x 70
paste_bottom(wall_s, HOUSE_CX, WALL_BASE, target=house)
wall_top = WALL_BASE - wall_s.height
paste_bottom(scaled(WINDOW, 24), HOUSE_CX - 30, WALL_BASE - 8, target=house)
paste_bottom(scaled(WINDOW, 24), HOUSE_CX + 30, WALL_BASE - 8, target=house)
paste_bottom(scaled(DOOR, 42), HOUSE_CX, WALL_BASE, target=house)
roof_s = scaled_w(ROOF, 118)              # ~118 x 64, overhangs the wall
paste_bottom(roof_s, HOUSE_CX, wall_top + 14, target=house)

os.makedirs(OUT, exist_ok=True)
scene.save(os.path.join(OUT, "world_scene.png"))
house.save(os.path.join(OUT, "world_house.png"))
print("baked world_scene.png", scene.size, "+ world_house.png", house.size)
