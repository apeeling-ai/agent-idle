# Image Generation Style

Use this file for any image generation that creates in-game map, sprite, prop, or background art.

## Required Reference

Before calling image generation, inspect:

`sprites/generated/imagegen_style_reference.png`

That reference is built from the current in-repo assets: the cabin overlay, player/body sprites, NPC armor, Pixel Crawler rocks, vegetation, terrain tiles, water tiles, and the current baked world scene.

## Style Contract

Generated in-game art must match the shipped sprite assets:

- Chunky low-resolution pixel art with clear dark outlines.
- Flat, readable forms with limited shading steps.
- Pixel Crawler / LPC-compatible fantasy sprite style.
- Simple terrain textures and sparse decorative detail.
- Saturated but constrained grass, wood, stone, dirt, and water palette.
- Props should look like they came from the existing `sprites/Environment` sheets.

Avoid:

- Painterly or high-detail RPG background art.
- Smooth brush shading, anti-aliased illustration, or glossy lighting.
- Dense noise/detail that makes the map sharper than the character sprites.
- Objects without dark pixel outlines.
- Generic pixel-art styles that do not match the reference sheet.

## Map Prompt Template

Use this as the base prompt for map/background generation:

```text
Use the provided style reference image as the strict visual target.

Create a clean in-game map background in the same style as the reference: chunky low-resolution fantasy pixel art, dark pixel outlines, flat readable shapes, limited shading, Pixel Crawler/LPC-compatible props and terrain, simple grass/dirt/water textures, and the same palette family as the cabin, characters, rocks, vegetation, and current baked map.

Do not make a painterly RPG background. Do not add smooth gradients, glossy lighting, high-detail foliage, realistic texture, or anti-aliased illustration. The result must look like it belongs in the same sprite pack as the reference.

Hard constraints:
- Clean background only: no UI, text, labels, app chrome, player character, pets, level badges, or name tags.
- Keep all props fully inside the frame. No clipped trees, rocks, graves, logs, water, bushes, flowers, or props at the image edge.
- Leave a clean top-center clearing for the separate cabin overlay.
- Keep pet standing areas open and uncluttered.
- Do not bake a campfire if the app draws one live.
```

For the current world map, the fixed coordinate contract is:

- Canvas: `480x450`
- Cabin/player clearing: `x=240`, `y=100-170`
- Player porch feet: `x=240`, `y=160`
- Path hub: `x=240`, `y=290`
- Mine pet cluster: `x=84`, `y=188`
- Lumber pet cluster: `x=392`, `y=188`
- Pond pet cluster/bank: `x=126`, `y=292`
- Camp pet cluster: `x=150`, `y=356`
- Live campfire: `x=184`, `y=386`
- Graveyard/rest cluster: `x=336`, `y=356`

## Preferred Path

Use image generation for new or improved in-game art assets where possible, with `sprites/generated/imagegen_style_reference.png` as the strict style target.

Fall back to baking/compositing from existing sprite sheets only when the work needs deterministic placement, transparent overlays, exact sprite reuse, or correction of a generation that cannot reliably follow the coordinate contract.
