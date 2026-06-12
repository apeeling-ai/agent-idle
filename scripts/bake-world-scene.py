#!/usr/bin/env python3
"""
Bake the ambient world's BACKGROUND SCENE — a lush grass homestead in the Pixel Crawler style.

The world is a grass field with soft dirt/stone clearings for the work zones, a real cabin the
player stands in front of, a proper headstone graveyard, a pond with a sandy bank, a two-boulder
mine, and nature scattered in natural COPSES (clumps) rather than even noise. We bake it ONCE here
into a single 480x360 PNG that the renderer draws as the backdrop; pets and the animated campfire
render on top as live sprites.

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
W, H = 480, 360  # the ambient world canvas — matches WORLD_AREA in apps/app/src/render/layout.ts
SX, SY = W / 480.0, H / 360.0  # POSITIONS scale from the 480×360 reference; native SIZES stay as-is

flo = Image.open(os.path.join(ENV, "Tilesets/Floors_Tiles.png")).convert("RGBA")
veg = Image.open(os.path.join(ENV, "Props/Static/Vegetation.png")).convert("RGBA")
rocks = Image.open(os.path.join(ENV, "Props/Static/Rocks.png")).convert("RGBA")
dungeon = Image.open(os.path.join(ENV, "Props/Static/Dungeon_Props.png")).convert("RGBA")
tree01 = Image.open(os.path.join(ENV, "Props/Static/Trees/Model_01/Size_02.png")).convert("RGBA")
tree02 = Image.open(os.path.join(ENV, "Props/Static/Trees/Model_02/Size_02.png")).convert("RGBA")
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


GRAVE = darken(STONE, 0.62, blue=1.14)  # cool, somber stone — not a black hole


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


def fits(cx, by, img, pad=1):
    """True iff an image pasted via paste_bottom(cx, by) stays fully inside the frame — used to
    stop tall trees from having their crowns clipped at the top edge (the old cutoff bug)."""
    return (cx - img.width / 2) >= pad and (cx + img.width / 2) <= W - pad and (by - img.height) >= pad and by <= H - pad


# Pet CLUSTER centers (sprite center) — MUST match ZONE_CLUSTER in apps/app/src/render/layout.ts.
# Each pet faces right (+1); its zone's prop sits PROP_DX to the right at the same ground line so
# the mining swing / chop lands on the boulder / tree instead of empty air.
# Positions scaled by (SX, SY) from the 480×360 reference; native element SIZES are kept as-is.
# (The old "grove" gather zone is retired — reading/searching now sends pets FISHING at the pond.)
CLUSTERS = {k: (round(x * SX), round(y * SY)) for k, (x, y) in {"mine": (84, 150), "lumber": (392, 150), "camp": (150, 285), "rest": (336, 285)}.items()}
PROP_DX, PROP_DY = 34, 30
HOUSE_CX, PORCH_Y = round(240 * SX), round(128 * SY)  # PORCH_Y == PLAYER_FRAC.y*H + BASE_SPRITE/2 in layout.ts

# --- worn dirt paths: a hub in the middle linked out to every zone + up to the porch ---
HUB = (round(240 * SX), round(232 * SY))
path_mask = Image.new("L", (W, H), 0)
pd = ImageDraw.Draw(path_mask)
for name in ("mine", "lumber", "camp", "rest"):
    cx, cy = CLUSTERS[name]
    pd.line([HUB, (cx + 16, cy + 16)], fill=170, width=13)
pd.line([HUB, (HOUSE_CX, PORCH_Y + 4)], fill=170, width=13)
pd.ellipse([HUB[0] - 18, HUB[1] - 13, HUB[0] + 18, HUB[1] + 13], fill=170)
path_mask = path_mask.filter(ImageFilter.GaussianBlur(3))
path = tile_fill(DIRT, W, H)
path.putalpha(path_mask)
scene.alpha_composite(path)

# --- a pond with a sandy bank in the open left-centre (where the fishers cast their lines) ---
POND = (round(52 * SX), round(232 * SY))
paste_center(soft_clearing(DIRT, 112, 84, 77, core=0.3, blur=4), POND[0], POND[1])  # bank
paste_center(soft_clearing(WATER, 90, 64, 78, core=0.62, blur=2, lump=0.08, power=1.2), POND[0], POND[1])

# --- work-zone clearings, centered to cover both the pets and their prop ("areas a bit bigger") ---
CLEAR_W, CLEAR_H = 150, 106
CLEAR_FILL = {"mine": (STONE, 11), "lumber": (DIRT, 22), "camp": (DIRT, 33), "rest": (GRAVE, 44)}
for name, (fill, seed) in CLEAR_FILL.items():
    cx, cy = CLUSTERS[name]
    paste_center(soft_clearing(fill, CLEAR_W, CLEAR_H, seed), cx + 16, cy + 16)

# --- decoration crops ---
BUSHES = [veg.crop((0, 0, 64, 64)), veg.crop((64, 0, 128, 64))]  # two GREEN bushes
BUSH_AUTUMN = veg.crop((128, 0, 192, 64))  # olive accent
FERN = veg.crop((96, 256, 152, 312))
MUSH = veg.crop((8, 320, 32, 344))
FLOWERS = [veg.crop((0, 352, 16, 368)), veg.crop((0, 384, 16, 400)), veg.crop((0, 400, 16, 416))]  # orange/white/blue
BOULDER_TALL = rocks.crop((96, 14, 126, 64))    # tall grey boulder (mine, prop 1)
BOULDER_WIDE = rocks.crop((128, 16, 160, 49))   # wide grey boulder (mine, prop 2)
BOULDER_BROWN = rocks.crop((0, 16, 32, 64))
ROCK_SM = rocks.crop((16, 96, 32, 112))
# a real tree family for variety: a standard green, a lush round green, autumn + gold, a pine, and
# a bare DEAD tree for the graveyard.
TREE = tree03.crop((0, 5, 30, 80))
TREE_LUSH = tree01.crop((32, 2, 64, 63))
TREE_AUTUMN = tree01.crop((32, 66, 64, 127))
TREE_GOLD = tree01.crop((96, 66, 128, 127))
DEAD_TREE = tree01.crop((160, 2, 192, 63))
PINE = tree02.crop((63, 2, 97, 92))
GREEN_TREES = [TREE, TREE_LUSH, PINE, TREE_GOLD]  # the everyday canopy mix
# headstones (the pack's only real grave markers): an arched stone cross + a wooden grave board.
TOMB_CROSS = dungeon.crop((112, 0, 127, 25))
TOMB_WOOD = dungeon.crop((128, 0, 143, 26))


def prop_at(zone, img, h, dx=PROP_DX, dy=PROP_DY):
    cx, cy = CLUSTERS[zone]
    paste_bottom(scaled(img, h), cx + dx, cy + dy)


# --- the mine: TWO boulders to swing at (a proper quarry, not one lone rock) + scattered rubble ---
mcx, mcy = CLUSTERS["mine"]
prop_at("mine", BOULDER_TALL, 52)                                   # main boulder at the work spot
paste_bottom(scaled(BOULDER_WIDE, 40), mcx + PROP_DX + 26, mcy + PROP_DY + 8)  # 2nd boulder beside it
rng = random.Random(12)
for _ in range(4):  # loose rubble around the rock face
    paste_bottom(scaled(ROCK_SM, rng.randint(10, 16)), mcx + PROP_DX + rng.randint(-18, 30), mcy + PROP_DY + rng.randint(2, 16))

# --- the lumber yard: a tree to fell (campfire at camp stays a live sprite) ---
prop_at("lumber", TREE, 84)


def wooden_cross(h):
    """A small leaning grave cross built from two dark-wood beams."""
    w = max(4, int(h * 0.64))
    img = Image.new("RGBA", (w, h + 1))
    d = ImageDraw.Draw(img)
    col, edge = (78, 55, 34, 255), (52, 36, 22, 255)
    bw = max(2, int(round(h * 0.16)))
    cx = w // 2
    d.rectangle([cx - bw // 2 - 1, 0, cx + bw // 2, h], fill=edge)         # vertical (with edge)
    d.rectangle([cx - bw // 2, 1, cx + bw // 2 - 1, h - 1], fill=col)
    cy = int(h * 0.30)
    d.rectangle([0, cy - bw // 2 - 1, w - 1, cy + bw // 2], fill=edge)     # crossbar
    d.rectangle([1, cy - bw // 2, w - 2, cy + bw // 2 - 1], fill=col)
    return img


def grave_mound(w, h):
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    d.ellipse([0, 0, w - 1, h - 1], fill=(54, 39, 26, 230))
    d.ellipse([2, 1, w - 3, h - 3], fill=(72, 53, 36, 230))
    return img


# --- the graveyard: a fenced plot of headstones, crosses & grave mounds under a bare dead tree ---
rcx, rcy = CLUSTERS["rest"]
gcx, gcy = rcx + 16, rcy + 16          # graveyard clearing centre (matches the GRAVE patch)
rng = random.Random(55)
paste_bottom(scaled(DEAD_TREE, 74), gcx - 54, gcy - 12)            # spooky bare tree at the back
# a low back-and-side rail fence so the plot reads as an enclosed graveyard
fd = ImageDraw.Draw(scene)
post, rail = (58, 41, 26, 255), (74, 54, 34, 255)
fy = gcy - 34
fd.line([(gcx - 50, fy), (gcx + 56, fy)], fill=rail, width=2)      # back top rail
for px in range(gcx - 50, gcx + 57, 12):
    fd.line([(px, fy - 9), (px, fy + 3)], fill=post, width=3)      # back posts
for side_x in (gcx - 50, gcx + 56):                               # short side posts stepping forward
    for k, py in enumerate((fy + 10, fy + 26)):
        fd.line([(side_x, py - 8), (side_x, py + 3)], fill=post, width=3)
# headstones + crosses in two rows, painted back-to-front so nearer ones overlap
graves = []
back_row = [TOMB_CROSS, TOMB_WOOD, "cross", TOMB_CROSS, TOMB_WOOD]
for i, col in enumerate(range(-46, 58, 24)):
    item = back_row[i % len(back_row)]
    img = wooden_cross(rng.randint(22, 26)) if item == "cross" else scaled(item, rng.randint(23, 27))
    graves.append((gcy - 16, img, gcx + col + rng.randint(-2, 2), gcy - 16))
front_row = [TOMB_WOOD, TOMB_CROSS, "cross", TOMB_WOOD]
for i, col in enumerate(range(-36, 50, 28)):
    x = gcx + col + rng.randint(-2, 2)
    graves.append((gcy + 9, grave_mound(rng.randint(18, 24), rng.randint(8, 11)), x, gcy + 13))  # mound first
    item = front_row[i % len(front_row)]
    img = wooden_cross(rng.randint(26, 30)) if item == "cross" else scaled(item, rng.randint(27, 31))
    graves.append((gcy + 10, img, x, gcy + 10))
for _, img, x, by in sorted(graves, key=lambda g: g[0]):
    paste_bottom(img, x, by)

# --- scatter nature in COPSES (clumps) with open lawn between — reads natural, not noisy ---
rng = random.Random(99)
BLOCK = [(cx + 16, cy + 16, CLEAR_W, CLEAR_H) for cx, cy in CLUSTERS.values()]
BLOCK.append((POND[0], POND[1], 124, 96))          # pond + bank
BLOCK.append((HOUSE_CX, PORCH_Y + 6, 138, 196))    # the cabin + porch + the lawn directly behind it


def blocked(x, y, pad=2):
    return any(abs(x - bx) < bw / 2 + pad and abs(y - by) < bh / 2 + pad for bx, by, bw, bh in BLOCK)


deco = []  # (y_for_sort, image, x, y)

# clump centres spread across the lawn
clumps = []
tries = 0
while len(clumps) < 14 and tries < 600:
    tries += 1
    cx, cy = rng.randint(24, W - 24), rng.randint(34, H - 18)
    if blocked(cx, cy, 22) or any(math.hypot(cx - px, cy - py) < 44 for px, py, _ in clumps):
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
        elif roll < 0.30:
            img, hh = rng.choice(GREEN_TREES), rng.randint(58, 86)  # more trees in the copses
        elif roll < 0.40:
            img, hh = FERN, rng.randint(22, 32)
        elif roll < 0.64:
            img, hh = BUSHES[rng.randrange(2)], rng.randint(15, 24)
        elif roll < 0.86:
            img, hh = FLOWERS[rng.randrange(3)], rng.randint(10, 15)
        elif roll < 0.94:
            img, hh = MUSH, rng.randint(11, 16)
        else:
            img, hh = ROCK_SM, rng.randint(10, 15)
        simg = scaled(img, hh)
        if not fits(x, y, simg):  # never clip a crown on the frame edge
            continue
        deco.append((y, simg, x, y))

# a generous ring of standalone landmark trees in the open (variety + a fuller, leafier world)
for _ in range(11):
    for _try in range(12):
        img = rng.choice(GREEN_TREES + [TREE_AUTUMN])
        simg = scaled(img, rng.randint(60, 92))
        x, y = rng.randint(20, W - 20), rng.randint(40, H - 14)
        if not blocked(x, y, 14) and fits(x, y, simg) and all(math.hypot(x - px, y - py) > 38 for px, py, _ in clumps):
            deco.append((y, simg, x, y))
            break

# light sprinkle of single flowers on the open lawn for life
for _ in range(24):
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
ROOF = roofs_b.crop((1, 22, 111, 80))     # brown gable, cropped CLEAN (no clipped peak, no green bleed)
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
roof_s = scaled_w(ROOF, 122)              # ~122 x 64, overhangs the wall on both sides
roof_by = wall_top + 16
paste_bottom(roof_s, HOUSE_CX, roof_by, target=house)

# a little brick chimney on the right roof slope — the touch that makes the cabin feel lived-in
roof_top = roof_by - roof_s.height
chim_x, chim_top, cw, ch = HOUSE_CX + 26, roof_top + 12, 9, 17
cd = ImageDraw.Draw(house)
cd.rectangle([chim_x, chim_top, chim_x + cw, chim_top + ch], fill=(122, 73, 55, 255))     # brick stack
for my in range(chim_top + 4, chim_top + ch, 4):
    cd.line([(chim_x, my), (chim_x + cw, my)], fill=(98, 58, 42, 255))                    # mortar courses
cd.rectangle([chim_x - 2, chim_top - 3, chim_x + cw + 2, chim_top], fill=(86, 52, 38, 255))  # cap

os.makedirs(OUT, exist_ok=True)
scene.save(os.path.join(OUT, "world_scene.png"))
house.save(os.path.join(OUT, "world_house.png"))
print("baked world_scene.png", scene.size, "+ world_house.png", house.size)
