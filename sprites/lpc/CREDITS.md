# LPC player-gear assets — per-file attribution

The player avatar's body + tiered gear layers (`sprites/lpc/`) come from the **Liberated Pixel
Cup (LPC)** collection, via the Universal LPC Spritesheet Character Generator:
https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator

Layers are built by `scripts/bake-player-assets.py` from a local clone of the generator repo
(straight copies, a body+head composite, and single-frame crops of the weapon walk sheets).
The credits below were **reconciled against the generator's authoritative per-file
`CREDITS.csv`** (upstream `master`, retrieved 2026-07-08) for exactly the source sheets this
repo ships. If `bake-player-assets.py` changes which sheets it pulls, re-reconcile this file.

Each asset is offered by its authors under the license(s) listed for it (multi-licensed assets
may be used under any one of their listed licenses). The baked/cropped/composited PNGs in this
folder are **redistributed under the same license(s) as their upstream sources** — cropping a
frame or compositing two layers does not change the terms. CC-BY-SA and OGA-BY require this
attribution file to travel with the art; CC-BY-SA additionally requires derivatives of the
*art* to stay share-alike.

License texts: [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) ·
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) ·
[CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) ·
[CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) ·
[OGA-BY 3.0](https://static.opengameart.org/OGA-BY-3.0.txt) ·
[GPL 2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) ·
[GPL 3.0](https://www.gnu.org/licenses/gpl-3.0.html)

## Body

**`body/idle.png`** — composite of upstream `body/bodies/male/idle.png` +
`head/heads/human/male/idle.png`.
- Authors (body): bluecarrot16, JaidynReiman, Benjamin K. Smith (BenCreating), Evert,
  Eliza Wyatt (ElizaWy), TheraHedwig, MuffinElZangano, Durrani, Johannes Sjölund (wulax),
  Stephen Challener (Redshrike)
- Authors (head): bluecarrot16, Benjamin K. Smith (BenCreating), Stephen Challener (Redshrike)
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Sources: [LPC base assets](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles),
  [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC character bases](https://opengameart.org/content/lpc-character-bases),
  [LPC revised character basics](https://opengameart.org/content/lpc-revised-character-basics),
  [LPC jump expanded](https://opengameart.org/content/lpc-jump-expanded),
  [LPC be seated](https://opengameart.org/content/lpc-be-seated),
  [LPC runcycle and diagonal walkcycle](https://opengameart.org/content/lpc-runcycle-and-diagonal-walkcycle),
  [LPC male jumping animation by Durrani](https://opengameart.org/content/lpc-male-jumping-animation-by-durrani),
  [LPC runcycle for male muscular and pregnant bases](https://opengameart.org/content/lpc-runcycle-for-male-muscular-and-pregnant-character-bases-with-modular-heads)

## Armor (torso)

**`armor/cloth.png`** ← `torso/clothes/longsleeve/longsleeve/male/idle.png`
- Authors: JaidynReiman, Johannes Sjölund (wulax); tweaks/recolors by bluecarrot16
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC clothing updates](https://opengameart.org/content/lpc-clothing-updates),
  [LPC revised character basics](https://opengameart.org/content/lpc-revised-character-basics),
  [ElizaWy LPC clothing](https://github.com/ElizaWy/LPC/tree/main/Characters/Clothing),
  [LPC expanded sit/run/jump](https://opengameart.org/content/lpc-expanded-sit-run-jump-more),
  [LPC expanded simple shirts](https://opengameart.org/content/lpc-expanded-simple-shirts)

**`armor/leather.png`** ← `torso/armour/leather/male/idle.png`
- Authors: Johannes Sjölund (wulax), bluecarrot16, JaidynReiman
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC clothing updates](https://opengameart.org/content/lpc-clothing-updates),
  [LPC expanded armor](https://opengameart.org/content/lpc-expanded-armor)

**`armor/chain.png`** ← `torso/chainmail/male/idle.png`
- Authors: Johannes Sjölund (wulax), Napsio (Vitruvian Studio), JaidynReiman; minor edits by
  bluecarrot16
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Source: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites)

**`armor/plate.png`** ← `torso/armour/plate/male/idle.png`
- Authors: Napsio (Vitruvian Studio), JaidynReiman, bluecarrot16, Michael Whitlock
  (bigbeargames), Johannes Sjölund (wulax)
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC combat armor for women](https://opengameart.org/content/lpc-combat-armor-for-women)

**`armor/legion.png`** ← `torso/armour/legion/male/idle.png`
- Authors: Napsio (Vitruvian Studio), JaidynReiman, bluecarrot16, Nila122
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 2.0 / GPL 3.0
- Source: [LPC Roman armor](https://opengameart.org/content/lpc-roman-armor)

## Helmets

**`helm/nasal.png`** ← `hat/helmet/nasal/adult/idle.png`
- Author: bluecarrot16
- License: CC-BY 3.0 / CC-BY 4.0 / OGA-BY 3.0 / GPL 2.0 / GPL 3.0
- Sources: [LPC helmets](https://opengameart.org/content/lpc-helmets),
  [LPC expanded hats, facial, helmets](https://opengameart.org/content/lpc-expanded-hats-facial-helmets)

**`helm/norman.png`** ← `hat/helmet/norman/adult/idle.png`
- Authors: ElizaWy, Sander Frenken (castelonia)
- License: OGA-BY 3.0 / CC-BY-SA 4.0 / CC-BY-SA 3.0 / GPL 3.0
- Sources: [LPC realistic helmet pack](https://opengameart.org/content/lpc-realistic-helmet-pack),
  [LPC expanded hats, facial, helmets](https://opengameart.org/content/lpc-expanded-hats-facial-helmets)

**`helm/barbuta.png`** ← `hat/helmet/barbuta/male/idle.png`
- Author: bluecarrot16
- License: OGA-BY 3.0 / CC-BY 3.0 / CC-BY 4.0 / GPL 2.0 / GPL 3.0
- Sources: [LPC helmets](https://opengameart.org/content/lpc-helmets),
  [LPC expanded hats, facial, helmets](https://opengameart.org/content/lpc-expanded-hats-facial-helmets)

**`helm/greathelm.png`** ← `hat/helmet/greathelm/male/idle.png`
- Author: bluecarrot16
- License: OGA-BY 3.0 / CC-BY 3.0 / CC-BY 4.0 / GPL 2.0 / GPL 3.0
- Sources: [LPC helmets](https://opengameart.org/content/lpc-helmets),
  [LPC expanded hats, facial, helmets](https://opengameart.org/content/lpc-expanded-hats-facial-helmets)

**`helm/legion.png`** ← `hat/helmet/legion/adult/idle.png`
- Authors: bluecarrot16, Nila122, JaidynReiman, Matthew Krohn (makrohn), Johannes Sjölund (wulax)
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 2.0 / GPL 3.0
- Sources: [LPC Roman armor](https://opengameart.org/content/lpc-roman-armor),
  [LPC expanded hats, facial, helmets](https://opengameart.org/content/lpc-expanded-hats-facial-helmets)

## Legs

**`legs/cloth.png`** ← `legs/pants/male/idle.png`
- Authors: bluecarrot16, JaidynReiman, ElizaWy, Matthew Krohn (makrohn), Johannes Sjölund
  (wulax), Stephen Challener (Redshrike)
- License: OGA-BY 3.0 / GPL 3.0 / CC-BY-SA 3.0
- Sources: [LPC base assets](https://opengameart.org/content/liberated-pixel-cup-lpc-base-assets-sprites-map-tiles),
  [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC expanded pants](https://opengameart.org/content/lpc-expanded-pants)

**`legs/hose.png`** ← `legs/hose/male/idle.png`
- Authors: JaidynReiman, ElizaWy, bluecarrot16, Johannes Sjölund (wulax), Stephen Challener
  (Redshrike)
- License: OGA-BY 3.0 / GPL 3.0
- Sources: [ElizaWy LPC clothing](https://github.com/ElizaWy/LPC/tree/main/Characters/Clothing),
  [LPC expanded pants](https://opengameart.org/content/lpc-expanded-pants)

**`legs/studded.png`** ← `legs/leggings2/male/idle.png`
- Authors: bluecarrot16, ElizaWy, JaidynReiman, Mandi Paugh, William.Thompsonj, Johannes
  Sjölund (wulax), Stephen Challener (Redshrike)
- License: OGA-BY 3.0 / GPL 3.0
- Sources: [ElizaWy LPC clothing](https://github.com/ElizaWy/LPC/tree/main/Characters/Clothing),
  [LPC expanded pants](https://opengameart.org/content/lpc-expanded-pants)

**`legs/greaves.png`** ← `legs/armour/plate/male/idle.png`
- Authors: bluecarrot16, JaidynReiman, Michael Whitlock (bigbeargames), Matthew Krohn
  (makrohn), Johannes Sjölund (wulax)
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Source: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites)

**`legs/legion.png`** ← `legs/skirts/legion/male/idle.png`
- Authors: bluecarrot16, Nila122
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 2.0 / GPL 3.0
- Sources: [LPC Roman armor](https://opengameart.org/content/lpc-roman-armor),
  [LPC clothing updates](https://opengameart.org/content/lpc-clothing-updates)

## Weapons

Each `weapon/*.png` is a single standing frame cropped from the upstream weapon `walk` sheet.

**`weapon/bronze.png`** ← `weapon/sword/dagger/walk.png` (dagger)
- Authors: bluecarrot16, Johannes Sjölund (wulax), Matthew Krohn (makrohn)
- License: OGA-BY 3.0 / CC-BY-SA 3.0 / GPL 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC extended weapon animations](https://opengameart.org/content/lpc-extended-weapon-animations)

**`weapon/iron.png`** ← `weapon/sword/saber/walk.png` (saber)
- Authors: Daniel Eddeland (daneeklu), Johannes Sjölund (wulax), gr3yh47, bluecarrot16
- License: **CC-BY-SA 3.0 only** (attribution + share-alike)
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC extended weapon animations](https://opengameart.org/content/lpc-extended-weapon-animations)

**`weapon/steel.png`** ← `weapon/sword/longsword/walk.png` (longsword)
- Authors: Johannes Sjölund (wulax), bluecarrot16
- License: OGA-BY 3.0 / CC-BY-SA 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC extended weapon animations](https://opengameart.org/content/lpc-extended-weapon-animations)

**`weapon/mithril.png`** ← `weapon/sword/rapier/walk.png` (rapier)
- Authors: Johannes Sjölund (wulax), bluecarrot16
- License: OGA-BY 3.0 / CC-BY-SA 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC extended weapon animations](https://opengameart.org/content/lpc-extended-weapon-animations)

**`weapon/prismatic.png`** ← `weapon/sword/glowsword/walk/blue.png` (glowsword)
- Authors: bluecarrot16, tskaufma, Johannes Sjölund (wulax)
- License: OGA-BY 3.0 / CC-BY-SA 3.0
- Sources: [LPC medieval fantasy character sprites](https://opengameart.org/content/lpc-medieval-fantasy-character-sprites),
  [LPC glow sword](https://opengameart.org/content/lpc-glow-sword),
  [LPC extended weapon animations](https://opengameart.org/content/lpc-extended-weapon-animations)

## Auras

**`aura/spark.png`**, **`aura/flame.png`**, **`aura/radiant.png`** — procedural radial glows
generated by `scripts/bake-player-assets.py` (no LPC art). Original Agent Idle project art,
AGPL-3.0 like the rest of the project's own assets.
