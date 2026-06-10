# LPC player-gear assets — attribution

The player avatar's body + tiered gear layers (`sprites/lpc/`) come from the **Liberated Pixel
Cup (LPC)** collection, via the Universal LPC Spritesheet Character Generator:
https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator

These assets are licensed under a mix of **CC0 / CC-BY 3.0+ / CC-BY-SA 3.0+ / GPL 3.0** (per
asset). Use requires crediting the authors of the non-CC0 pieces. Layers are built by
`scripts/bake-player-assets.py` from a local clone of the generator repo (re-run to refresh).
The generator's full CREDITS.csv lists every contributor; the authors for the layers we ship
include (non-exhaustive — see the generator repo for the authoritative per-asset credits):

- **Body / head / base:** Stephen Challener (Redshrike), Johannes Sjölund (wulax), Benjamin K. Smith (BenCreating), bluecarrot16, Eliza Wyatt (ElizaWy)
- **Armour (leather / chainmail / plate / legion) & helmets:** wulax, bluecarrot16, Nila122, Michael Whitlock (bigbeargames), Matthew Krohn (makrohn)
- **Clothes (longsleeve):** ElizaWy, bluecarrot16
- **Weapons (dagger / saber / longsword / rapier / glowsword):** wulax, Johannes Sjölund, bluecarrot16

Full license texts: https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/tree/master/spritesheets
(each asset folder carries its own `.txt`/`CREDITS` with the exact license + author).

**Action required before any public/commercial release:** export the generator's CREDITS.csv for
the exact layers shipped here and reconcile this file against it (CC-BY-SA / GPL impose
share-alike / source obligations).
