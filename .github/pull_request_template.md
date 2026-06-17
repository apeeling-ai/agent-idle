## What & why

<!-- What does this change do, and why? Link any related issue (#123). -->

## How I tested it

<!-- Commands run, manual steps, screenshots/GIF for UI changes. -->

## Checklist

- [ ] `pnpm run ci` passes locally (engine-purity + typecheck + convex typecheck + tests)
- [ ] No prompt-text / source-code fields added to any schema or payload (privacy is structural)
- [ ] Engine stays pure (no DOM/Node/network imports in `packages/engine/src`)
- [ ] Any new art/audio assets are recorded in `ATTRIBUTION.md` with their license
- [ ] Matches surrounding code style; no unrelated reformatting
