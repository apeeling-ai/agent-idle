# Agent Idle

An ambient desktop pet for developers, fed by real Claude Code usage. A small creature
lives on your second monitor, eats when you prompt in Claude Code (a thoughtful prompt
feeds it better than a lazy one), earns visible cosmetic armor as you ship, and ranks on
a credible public leaderboard.

This repo is the **scaffold + Phase 0** (the pure engine, fully tested). Everything
beyond the engine is a working skeleton with clearly-marked `STUB`/`TODO`s.

## Layout

```
agent-idle/
├── packages/engine/   # pure TS reducer — the brain. No DOM/Node/fetch. Fully unit-tested.
├── convex/            # authoritative state + realtime sync (LOCAL deployment) + Convex Auth
├── apps/app/          # Tauri (React + Vite + PixiJS): UI, renderer, compositor
├── apps/cli/          # agent-idle CLI: setup, login/logout, ui, headless sensor daemon
├── sprites/           # Pixel Crawler sprites (by Anokolisa) — see license note below
└── scripts/           # engine-purity guardrail
```

The engine is imported **identically** by all three runtimes — Convex mutations (the
authority), the CLI daemon (local appraisal), and the app (instant preview) — so the same
math runs everywhere. That is what keeps multiple machines on one account consistent.

## Prerequisites

- **Node ≥ 22** (`nvm use 22`). Set as default: `nvm alias default 22`.
- **pnpm** (this repo uses pnpm workspaces).
- **Rust + Tauri prerequisites** — required only to run the desktop app as a native window
  (`tauri dev`). **Not installed in this environment**, so the app was scaffolded and its
  web frontend builds, but the native shell has not been compiled here. See
  <https://tauri.app/start/prerequisites/>.
- **Convex** runs a **local** deployment (no cloud account needed for dev).

## Install, build, test

```bash
pnpm install
pnpm dev             # Turborepo: convex dev + engine watch + CLI tsc --watch + app vite (one command)
pnpm build           # turbo run build (builds packages/engine → dist first via ^build)
pnpm test            # engine unit tests (26 tests)
pnpm run ci          # engine purity + typechecks + convex typecheck + engine tests
```

`pnpm dev` is the everyday loop: it starts the local Convex deployment, recompiles the engine
and the **CLI** continuously (so hook changes are live), and serves the app frontend.

### Build order

The engine is consumed as built JS (`packages/engine/dist`), because the CLI runs under
plain Node which can't import `.ts`. Turbo's `^build` dependency builds the engine before
app/cli for `build`/`typecheck`/`test`/`dev`, so `pnpm dev` and `pnpm build` handle ordering
automatically. `dist/` is gitignored. (Only relevant if you invoke a package's `tsc`/`vite`/
`convex` directly, outside Turbo.)

## Run

```bash
# Convex (local deployment — authoritative state + realtime + auth)
pnpm convex:dev                                   # or: npx convex dev

# App (web frontend in the browser)
pnpm --filter @agent-idle/app dev
# App (native ambient window — needs Rust/Tauri)
pnpm --filter @agent-idle/app tauri dev

# CLI
pnpm --filter @agent-idle/cli build
node apps/cli/dist/index.js <setup|login|logout|daemon|ui|hook>
```

Typical first run: `convex dev` → `agent-idle setup` (registers the Claude Code hook) →
open the app and **Sign in with GitHub**. The sensor **daemon auto-starts** the first time
a hook fires and stays running — you don't start it by hand (`agent-idle daemon` is just for
foreground debugging).

## Architecture (locked decisions)

- **Convex is the authority.** Clients never write totals; they emit events, and
  `convex/events.ts:ingestEvent` validates + reduces them with the engine. `getAccountState`
  is the reactive read every client subscribes to.
- **Auth = Convex Auth + GitHub.** Trust comes from `ctx.auth.getUserIdentity()` — no
  hand-rolled OAuth, no per-account HMAC secret. (Replaced the original device-flow + HMAC
  plan; see "Auth".)
- **Lazy decay, no tick.** `engine.decay(snapshot, now)` is a pure function of elapsed
  time, computed at every read and reduce. Auto-faint/death is just the terminal rung being
  crossed by elapsed time — no scheduled per-entity job exists.
- **Privacy is structural.** No prompt-text / source-code column anywhere. The sensor
  appraises prompts **locally** (`engine.appraisePrompt`) and sends only counts + a coarse
  numeric quality score. Verified: the daemon's outbox contains numbers only.
- **One compositor.** `apps/app/src/render/compositor.ts` is renderer-agnostic (layer stack
  base → body → head → aura → status); `renderer-pixi.ts` is the only file that imports
  Pixi. The same compositor will drive the live creature, leaderboard avatars, and the
  share card. The engine never imports Pixi.

## Auth

Convex Auth with **two methods**:

- **Password (email + password)** — the default; in-app form, no browser, works out of the
  box on the local deployment.
- **GitHub OAuth** — for a verified/public leaderboard identity. Browser-based; requires a
  GitHub OAuth App: `npx convex env set AUTH_GITHUB_ID <id>` and `AUTH_GITHUB_SECRET <secret>`.

**One machine-shared session.** The token lives in `~/.agent-idle/auth.json` and is the
source of truth for the app, the CLI, and the daemon. The **daemon's loopback port is the
shared receiver** — the app's React frontend is the only real Convex Auth client (we never
hand-roll OAuth); after sign-in it posts its token to the daemon (`POST /auth-token`), and
everyone reads it back (`GET /token`).

**Either surface can establish it.** Sign in inside the app, or run `agent-idle login` — that
ensures the daemon (owns the shared port) is up, opens the system browser to the app's auth
page (`AUTH_URL`, default the Vite dev server), and polls the shared port until the token
lands. `agent-idle logout` clears the session everywhere (the daemon reads the store fresh
each flush).

## Open decisions (confirm with the team)

1. **Prompt quality in the competitive score.** `avgPromptQuality` is computed client-side
   from prompt text (privacy forbids sending text), so the server can't verify it — an
   unbounded cheat vector if weighted into rank. **Default: quality drives the PET only**
   (fill/mood/status); it is excluded from TrainerScore via
   `engine SCORING.includePromptQualityInScore = false` (weight 0). Flip only once a
   server-recomputable quality signal exists.
2. **Convex local → cloud / self-hosted-Postgres.** Running a local deployment now; the code
   is identical for cloud or self-hosted. Decide when to switch (and configure production
   auth env vars then).
3. **Pixel Crawler license.** `sprites/Terms.txt` (Anokolisa): commercial use in projects is
   explicitly allowed (point 4), but the assets **cannot be sold as a final product** and
   redistribution is restricted (points 2.1, 3). Since sprites are extractable from any
   shipped desktop bundle, **confirm we're permitted to redistribute them inside the app
   bundle** (or license/commission a pack we can ship). Crediting the author is appreciated.
4. **Decay thresholds + default failure mode.** Thresholds live in `engine config.ts`
   (`DECAY`): full→empty in 16h, then 24h grace before terminal. **Default mode is
   `faint`-and-recover (D1); permanent death only in Hardcore.** Confirm the numbers and the
   default.

## Generators-first / forced custom infra

Per the scaffolding philosophy we used official generators where possible
(`create-tauri-app`, `convex`, `@convex-dev/auth`, pnpm workspaces) and established libs
(PixiJS, Convex React/HTTP clients, node:crypto/node:http). Places we wrote custom infra:

- **Engine purity guardrail** (`scripts/check-engine-purity.mjs`) — a static scan that fails
  the build if `packages/engine` touches DOM/Node/network. No off-the-shelf tool for this.
- **Renderer/compositor + sprite slicing** — hand-written (no generator for a sprite
  compositor). Kept behind a framework-agnostic seam.
- **CLI daemon** — node's built-in HTTP server (loopback) + a durable on-disk JSONL outbox.
  Standard-lib, not custom sockets, but the outbox is ours.
- **Sprites served via symlink** — `apps/app/public/sprites → ../../../sprites` so Vite
  serves the repo pack at `/sprites`.

## What's STUBbed (Phase 0 boundary)

- Leaderboard ranking — flat global sort by score (`convex/leaderboard.ts`). TODO: scopes,
  weekly resets, Open vs Verified tiers, visibility filtering.
- `sweepStale` cron — present but **off by default** (`convex/crons.ts`). There is no tick.
- Share card — `sharecard.ts` builds a Scene through the compositor but exports no image yet.
- Cosmetic sprite art — only the base species sheets (Knight/Wizard/Rogue) load; cosmetic
  layers and walk/hit/collect animations fall back to idle.
- Token attribution — daemon reads the transcript's last-turn usage (approximation);
  `linesAuthored` is 0.
- Standalone CLI OAuth — `login` currently drives the browser via the app; a localhost
  callback flow is a TODO.

## Phase 0 acceptance (all green)

`pnpm test` proves the engine: 10 idle hrs → hungrier; long neglect past threshold →
fainted (default) / dead (Hardcore); a gourmet prompt fills + scores high; "make it pop" →
confused + low. All pure functions of `(snapshot, now)`, no UI/IO.
