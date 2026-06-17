# Contributing to Agent Idle

Thanks for your interest! This guide covers how to get set up and what we expect in a PR.

## Prerequisites

- **Node ≥ 22** (`nvm use 22`). Node 20 will mysteriously fail the TS/Convex steps.
- **pnpm** (the repo uses pnpm workspaces).
- **Rust + Tauri prerequisites** only if you run the native desktop window
  (see <https://tauri.app/start/prerequisites/>). The web frontend builds without it.

## Setup

```bash
pnpm install
pnpm dev      # convex dev + engine watch + CLI watch + app vite, one command
```

## Before you open a PR

Run the full check locally — it must pass:

```bash
pnpm run ci   # engine-purity guardrail + typecheck + convex typecheck + engine tests
```

`pnpm run ci` is also what CI runs on every PR (`.github/workflows/ci.yml`).

## Ground rules

- **Read [`AGENTS.md`](AGENTS.md)** for behavioral guidelines (think before coding, simplicity
  first, surgical changes). The architecture's load-bearing ideas are in [`CLAUDE.md`](CLAUDE.md).
- **Keep the engine pure.** `packages/engine/src` must not import DOM/Node/network APIs — this
  is enforced by `scripts/check-engine-purity.mjs` and will fail CI otherwise.
- **Never add prompt-text or source-code fields** to any schema or payload. Privacy is
  structural here (see [`PRIVACY.md`](PRIVACY.md)); a PR that weakens it will be rejected.
- **Match the surrounding code** — comment density, naming, idiom. No drive-by reformatting.
- **Don't commit secrets.** `.env*`, `~/.agent-idle/`, and build output are gitignored; keep it
  that way.
- **Asset licensing:** if you add art/audio, record its source and license in
  [`ATTRIBUTION.md`](ATTRIBUTION.md). Only contribute assets you have the right to redistribute
  under the repo's terms.

## Commits & PRs

- Branch off `main`; keep PRs focused.
- Write a clear PR description: what changed, why, and how you tested it.
- Link any related issue.

## License of contributions

By contributing, you agree that your contributions are licensed under the project's
**AGPL-3.0-only** license (see [`LICENSE`](LICENSE)). Assets remain under their own licenses as
documented in [`ATTRIBUTION.md`](ATTRIBUTION.md).
