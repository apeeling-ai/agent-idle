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
W, H = 480, 450  # the ambient world canvas (25% taller than the 480×360 reference, so the zones
                 # spread vertically) — matches WORLD_AREA in apps/app/src/render/layout.ts
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


GRAVE = darken(DIRT, 0.40)  # dark brown/near-black graveyard soil


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
pd.line([HUB, (126, 292)], fill=170, width=13)  # road to the pond — the fisher's right-bank spot (matches ZONE_CLUSTER.pond in layout.ts); the pond, drawn next, covers the inner end
pd.ellipse([HUB[0] - 18, HUB[1] - 13, HUB[0] + 18, HUB[1] + 13], fill=170)
path_mask = path_mask.filter(ImageFilter.GaussianBlur(3))
path = tile_fill(DIRT, W, H)
path.putalpha(path_mask)
scene.alpha_composite(path)

# --- a bigger pond with a sandy bank in the open left-centre. The fisher stands on its RIGHT bank
#     and casts LEFT onto the water (see ZONE_CLUSTER.pond in layout.ts). Nudged right of the old
#     centre so the larger water body doesn't run off the left frame edge. ---
POND = (round(66 * SX), round(232 * SY))
paste_center(soft_clearing(DIRT, 152, 112, 77, core=0.3, blur=4), POND[0], POND[1])  # sandy bank
paste_center(soft_clearing(WATER, 122, 88, 78, core=0.62, blur=2, lump=0.08, power=1.2), POND[0], POND[1])

# --- work-zone clearings, centered to cover both the pets and their prop ("areas a bit bigger",
#     sized up with the taller world) ---
CLEAR_W, CLEAR_H = 172, 120
CLEAR_SIZE = {"rest": (232, 150)}  # the graveyard is a bigger, WIDER plot than the work zones
CLEAR_FILL = {"mine": (STONE, 11), "lumber": (DIRT, 22), "camp": (DIRT, 33), "rest": (GRAVE, 44)}
for name, (fill, seed) in CLEAR_FILL.items():
    cx, cy = CLUSTERS[name]
    w, h = CLEAR_SIZE.get(name, (CLEAR_W, CLEAR_H))
    paste_center(soft_clearing(fill, w, h, seed), cx + 16, cy + 16)

# --- decoration crops ---
BUSHES = [veg.crop((0, 0, 64, 64)), veg.crop((64, 0, 128, 64))]  # two GREEN bushes
BUSH_AUTUMN = veg.crop((128, 0, 192, 64))  # olive accent
FERN = veg.crop((96, 256, 152, 312))
MUSH = veg.crop((8, 320, 32, 344))
FLOWERS = [veg.crop((0, 352, 16, 368)), veg.crop((0, 384, 16, 400)), veg.crop((0, 400, 16, 416))]  # orange/white/blue
# four graded quarry rocks (tight crops from the warm-grey column of the atlas) for the mine,
# plus a small rock used by the nature scatter.
ROCK_BIG = rocks.crop((98, 19, 126, 62))    # 28×43 tall boulder — the one the pet swings at
ROCK_MED = rocks.crop((131, 19, 157, 46))   # 26×27 wide boulder
ROCK_SM2 = rocks.crop((176, 17, 192, 31))   # 16×14 small rock
ROCK_TINY = rocks.crop((161, 19, 175, 30))  # 14×11 tiny rock / gravel
ROCK_SM = rocks.crop((16, 96, 32, 112))     # small rock for the nature scatter
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


# --- the mine: a little quarry of FOUR rocks of graduated sizes, biggest AT the work spot so the
#     pet's pickaxe swing lands on it; a touch of loose gravel for texture ---
mcx, mcy = CLUSTERS["mine"]
bx, by = mcx + PROP_DX, mcy + PROP_DY
prop_at("mine", ROCK_BIG, 54)                          # 1) big boulder at the work spot
paste_bottom(scaled(ROCK_MED, 38), bx + 27, by + 7)   # 2) medium boulder beside it
paste_bottom(scaled(ROCK_SM2, 24), bx - 20, by + 13)  # 3) small rock front-left
paste_bottom(scaled(ROCK_TINY, 18), bx + 13, by + 20) # 4) tiny rock front-centre
rng = random.Random(12)
for _ in range(3):  # loose gravel — clearly smaller than the four rocks
    paste_bottom(scaled(ROCK_TINY, rng.randint(7, 9)), bx + rng.randint(-22, 36), by + rng.randint(18, 26))

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


# --- the graveyard: a wider fenced plot of headstones, crosses & grave mounds, flanked by two
#     bare dead trees. The open front-left slot is where fallen pets are laid to rest. ---
rcx, rcy = CLUSTERS["rest"]
gcx, gcy = rcx + 16, rcy + 16          # graveyard clearing centre (matches the GRAVE patch)
rng = random.Random(55)
paste_bottom(scaled(DEAD_TREE, 74), gcx - 74, gcy - 10)           # bare dead tree at the back-left
paste_bottom(scaled(DEAD_TREE, 66), gcx + 72, gcy - 8)           # a second dead tree on the right
# a low back-and-side rail fence so the wider plot reads as an enclosed graveyard
fd = ImageDraw.Draw(scene)
post, rail = (58, 41, 26, 255), (74, 54, 34, 255)
fy = gcy - 34
fd.line([(gcx - 72, fy), (gcx + 72, fy)], fill=rail, width=2)     # back top rail
for px in range(gcx - 72, gcx + 73, 12):
    fd.line([(px, fy - 9), (px, fy + 3)], fill=post, width=3)     # back posts
for side_x in (gcx - 72, gcx + 72):                              # short side posts stepping forward
    for k, py in enumerate((fy + 10, fy + 26)):
        fd.line([(side_x, py - 8), (side_x, py + 3)], fill=post, width=3)
# headstones + crosses in two rows, painted back-to-front so nearer ones overlap. The front-left
# slot is left open with only a freshly-dug mound — that's where a dying pet is sent.
graves = []
back_row = [TOMB_CROSS, TOMB_WOOD, "cross", TOMB_CROSS, TOMB_WOOD]
for i, col in enumerate(range(-46, 58, 24)):
    item = back_row[i % len(back_row)]
    img = wooden_cross(rng.randint(22, 26)) if item == "cross" else scaled(item, rng.randint(23, 27))
    graves.append((gcy - 16, img, gcx + col + rng.randint(-2, 2), gcy - 16))
# the open grave (front-left): a fresh mound, NO headstone — the resting spot for the newly fallen
graves.append((gcy + 9, grave_mound(rng.randint(22, 27), rng.randint(9, 12)), gcx - 38, gcy + 13))
front_row = [TOMB_CROSS, "cross", TOMB_WOOD]
for i, col in enumerate(range(-8, 50, 28)):  # was range(-36,…): the -36 slot is now the open grave
    x = gcx + col + rng.randint(-2, 2)
    graves.append((gcy + 9, grave_mound(rng.randint(18, 24), rng.randint(8, 11)), x, gcy + 13))  # mound first
    item = front_row[i % len(front_row)]
    img = wooden_cross(rng.randint(26, 30)) if item == "cross" else scaled(item, rng.randint(27, 31))
    graves.append((gcy + 10, img, x, gcy + 10))
for _, img, x, by in sorted(graves, key=lambda g: g[0]):
    paste_bottom(img, x, by)

# --- scatter nature in COPSES (clumps) with open lawn between — reads natural, not noisy ---
rng = random.Random(99)
BLOCK = [(cx + 16, cy + 16, *CLEAR_SIZE.get(name, (CLEAR_W, CLEAR_H))) for name, (cx, cy) in CLUSTERS.items()]
BLOCK.append((POND[0], POND[1] + 26, 176, 188))    # pond + bank (enlarged); extended DOWN so tree
#                                                     copses don't base below the water and grow up out of it
BLOCK.append((HOUSE_CX, PORCH_Y + 6, 138, 196))    # the cabin + porch + the lawn directly behind it
# ONE tree with bushes, set well OFF to the LEFT-centre — in the open grass pocket between the mine
# and the pond, NOT fronting the central crossroads (the user did not want it at the junction). A
# wide block over the whole centre keeps random scatter off the crossroads AND around this tree.
CENTER_TREE = (165, 268)  # left-centre grass pocket: left of the mine road, below the mine, right of the pond
BLOCK.append((216, 296, 232, 156))  # scatter-free centre: crossroads + the tree (x100-332, y218-374)


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

# the deliberate tree + a COMPACT ring of bushes at its foot ("1 tree with some bushes"),
# kept tight so the cluster stays clear of the nearby mine road and pond bank
cx0, cy0 = CENTER_TREE
deco.append((cy0, scaled(TREE_LUSH, 78), cx0, cy0))
for i, (bx, by, bh) in enumerate(((-17, 6, 29), (16, 9, 31), (-2, 17, 25), (18, 1, 21), (-18, 0, 21))):
    deco.append((cy0 + by, scaled(BUSHES[i % 2], bh), cx0 + bx, cy0 + by))

# --- extra bushes LINING the roads: a few beside each HUB→zone path (offset perpendicular so they
#     hug the road rather than cover it), skipping the zones / house / pond / centre-tree ---
road_ends = [(CLUSTERS[n][0] + 16, CLUSTERS[n][1] + 16) for n in ("mine", "lumber", "camp", "rest")]
road_ends += [(HOUSE_CX, PORCH_Y + 4), (126, 292)]
PATH_AVOID = [(cx + 16, cy + 16, *CLEAR_SIZE.get(name, (CLEAR_W, CLEAR_H))) for name, (cx, cy) in CLUSTERS.items()]
PATH_AVOID += [(POND[0], POND[1] + 26, 176, 188), (HOUSE_CX, PORCH_Y + 6, 138, 196), (CENTER_TREE[0], CENTER_TREE[1] + 6, 92, 92)]


def path_blocked(x, y, pad=4):
    return any(abs(x - bx) < bw / 2 + pad and abs(y - by) < bh / 2 + pad for bx, by, bw, bh in PATH_AVOID)


prng = random.Random(23)
for ex, ey in road_ends:
    dxr, dyr = ex - HUB[0], ey - HUB[1]
    L = math.hypot(dxr, dyr) or 1.0
    perpx, perpy = -dyr / L, dxr / L          # unit perpendicular to the road
    for _ in range(prng.randint(3, 5)):       # a few bushes per road
        t = prng.uniform(0.24, 0.84)          # how far along the road
        side = prng.choice((-1, 1))           # which side of the road
        off = prng.uniform(14, 24)            # distance off the road centre
        bx = int(round(HUB[0] + dxr * t + perpx * off * side))
        by = int(round(HUB[1] + dyr * t + perpy * off * side))
        if path_blocked(bx, by):
            continue
        img = BUSH_AUTUMN if prng.random() < 0.22 else BUSHES[prng.randrange(2)]
        simg = scaled(img, prng.randint(16, 28))
        if fits(bx, by, simg):
            deco.append((by, simg, bx, by))

# paint back-to-front so nearer decorations overlap farther ones
for _, img, x, y in sorted(deco, key=lambda d: d[0]):
    paste_bottom(img, x, y)

# --- the player's HOUSE: a proper cabin at top-centre; the player stands on the porch deck.
# Baked onto its OWN transparent layer (world_house.png), NOT the scene: the renderer draws it
# as a FOREGROUND overlay (above pets, below the player) so pets can pass behind the cabin and
# be occluded by it. Stack bottom-up: porch deck → plank wall → flanking windows → door → roof.
# The roof is drawn PROCEDURALLY: the pack's only gable pieces are angled 3-D tiles with a notch
# at the eaves (they read as a "broken" roof head-on), so we build a clean symmetric front gable
# that actually sits on the wall, and the windows are seated HIGH in the wall (not at the deck
# line, where they used to get clipped by the porch). ---
WALL = roofs_b.crop((30, 158, 95, 200))   # clean framed plank panel (corner posts/legs trimmed off)
DOOR = props_b.crop((160, 16, 190, 61))   # arched plank door
DOOR = DOOR.crop(DOOR.getbbox())
WINDOW = props_b.crop((130, 97, 158, 126))  # framed blue 4-pane window
WINDOW = WINDOW.crop(WINDOW.getbbox())


def gable_roof(w, h):
    """A clean front-facing shingled gable (wide eaves → short ridge), drawn so it overhangs the
    wall with NO eave notch — unlike the pack's angled roof tiles."""
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    cx, ridge, base_y = w / 2, max(2, int(w * 0.07)), h - 1
    poly = [(0, base_y), (w - 1, base_y), (cx + ridge, 0), (cx - ridge, 0)]
    BASE, SHAD, RIDGE, TRIM, EAVE = (150, 96, 58, 255), (116, 72, 42, 255), (96, 60, 36, 255), (178, 130, 88, 255), (74, 48, 30, 255)
    d.polygon(poly, fill=BASE)
    for i, yy in enumerate(range(base_y - 4, 0, -5)):          # shingle courses
        d.line([(0, yy), (w, yy)], fill=SHAD)
        for sx in range((i % 2) * 7, w, 14):                   # subtle shingle seams
            d.line([(sx, yy - 3), (sx, yy)], fill=SHAD)
    d.line([(0, base_y), (cx - ridge, 0)], fill=TRIM, width=2)  # barge boards along the slopes
    d.line([(w - 1, base_y), (cx + ridge, 0)], fill=TRIM, width=2)
    d.line([(0, base_y - 1), (w, base_y - 1)], fill=EAVE, width=2)   # eave shadow
    d.rectangle([cx - ridge - 2, 0, cx + ridge + 2, 3], fill=RIDGE)  # ridge cap
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    img.putalpha(mask)
    return img


house = Image.new("RGBA", (W, H))
DECK_DEPTH = 8
WALL_BASE = PORCH_Y - DECK_DEPTH

# porch deck — a wood platform with a dark trim, in FRONT of (below) the cabin
porch = Image.new("RGBA", (112, 22))
for px in range(0, 112, 48):
    porch.paste(WOOD, (px, 0))
ImageDraw.Draw(porch).rectangle([0, 0, 111, 21], outline=(54, 35, 18, 255), width=2)
house.alpha_composite(porch, (HOUSE_CX - 56, WALL_BASE - 4))

wall_s = scaled_w(WALL, 100)              # ~100 x 64
paste_bottom(wall_s, HOUSE_CX, WALL_BASE, target=house)
wall_top = WALL_BASE - wall_s.height
paste_bottom(scaled(WINDOW, 22), HOUSE_CX - 31, wall_top + 26, target=house)  # seated HIGH in the wall
paste_bottom(scaled(WINDOW, 22), HOUSE_CX + 31, wall_top + 26, target=house)
paste_bottom(scaled(DOOR, 42), HOUSE_CX, WALL_BASE, target=house)             # centred, on the deck
roof_s = gable_roof(126, 50)              # clean front gable, overhangs the wall on both sides
roof_by = wall_top + 6
paste_bottom(roof_s, HOUSE_CX, roof_by, target=house)

# a little brick chimney on the right roof slope — the touch that makes the cabin feel lived-in
roof_top = roof_by - roof_s.height
chim_x, chim_top, cw, ch = HOUSE_CX + 27, roof_top + 18, 9, 17
cd = ImageDraw.Draw(house)
cd.rectangle([chim_x, chim_top, chim_x + cw, chim_top + ch], fill=(122, 73, 55, 255))     # brick stack
for my in range(chim_top + 4, chim_top + ch, 4):
    cd.line([(chim_x, my), (chim_x + cw, my)], fill=(98, 58, 42, 255))                    # mortar courses
cd.rectangle([chim_x - 2, chim_top - 3, chim_x + cw + 2, chim_top], fill=(86, 52, 38, 255))  # cap

os.makedirs(OUT, exist_ok=True)
scene.save(os.path.join(OUT, "world_scene.png"))
house.save(os.path.join(OUT, "world_house.png"))
print("baked world_scene.png", scene.size, "+ world_house.png", house.size)
