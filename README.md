# Agent Idle

An ambient desktop pet for developers, fed by real coding-agent usage. A small creature lives
on your second monitor, eats when you prompt in your coding agent (a thoughtful prompt feeds it
better than a lazy one), earns visible cosmetic armor as you ship, and ranks on a credible
public leaderboard.

> **Privacy first:** your prompts and source code **never leave your machine**. The sensor
> scores prompts *locally* and sends only a numeric quality score and counts. There is no
> prompt-text or source-code column anywhere in the backend — it's a structural guarantee, not
> a policy. See **[PRIVACY.md](PRIVACY.md)**.

This repo is the **scaffold + Phase 0** (the pure engine, fully tested). Everything beyond the
engine is a working skeleton with clearly-marked `STUB`/`TODO`s.

- 📖 Architecture deep-dive: [CLAUDE.md](CLAUDE.md) · behavioral guidelines: [AGENTS.md](AGENTS.md)
- 🔒 Data flow & trust: [PRIVACY.md](PRIVACY.md) · vulnerabilities: [SECURITY.md](SECURITY.md)
- 🤝 Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- ⚖️ License: code under **AGPL-3.0** ([LICENSE](LICENSE)); art keeps its own licenses ([ATTRIBUTION.md](ATTRIBUTION.md)) · credits ([CREDITS.md](CREDITS.md))

## Layout

```
agent-idle/
├── packages/engine/   # pure TS reducer — the brain. No DOM/Node/fetch. Fully unit-tested.
├── convex/            # authoritative state + realtime sync (LOCAL deployment) + Convex Auth
├── apps/app/          # Tauri (React + Vite + PixiJS): UI, renderer, compositor
├── apps/cli/          # agent-idle CLI: setup, remove, headless sensor daemon
├── sprites/           # game art — third-party packs, see ATTRIBUTION.md for licenses
└── scripts/           # engine-purity guardrail + asset bake scripts
```

The engine is imported **identically** by all three runtimes — Convex mutations (the
authority), the CLI daemon (local appraisal), and the app (instant preview) — so the same
math runs everywhere. That is what keeps multiple machines on one account consistent.

## Prerequisites

- **Node ≥ 22** (`nvm use 22`). Set as default: `nvm alias default 22`.
- **pnpm** (this repo uses pnpm workspaces).
- **Rust + Tauri prerequisites** — required only to run the desktop app as a native window
  (`tauri dev`). The web frontend builds without it. See
  <https://tauri.app/start/prerequisites/>.
- **Convex** runs a **local** deployment (no cloud account needed for dev).

## Install, build, test

```bash
pnpm install
pnpm dev             # Turborepo: convex dev + engine watch + CLI tsc --watch + app vite (one command)
pnpm build           # turbo run build (builds packages/engine → dist first via ^build)
pnpm test            # engine unit tests
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
node apps/cli/dist/index.js <setup [claude|codex] | status | remove | kill>
```

Typical first run: `convex dev` → `agent-idle setup` (pick your agent, register its hook,
and sign in in the browser). The sensor **daemon auto-starts** the first time a hook fires and
stays running — you don't start it by hand (`agent-idle daemon` is just for foreground debugging).

## Architecture (locked decisions)

- **Convex is the authority.** Clients never write totals; they emit events, and
  `convex/events.ts:ingestEvent` validates + reduces them with the engine. `getAccountState`
  is the reactive read every client subscribes to.
- **Auth = Convex Auth + GitHub.** Trust comes from `ctx.auth.getUserIdentity()` — no
  hand-rolled OAuth, no per-account HMAC secret.
- **Lazy decay, no tick.** `engine.decay(snapshot, now)` is a pure function of elapsed
  time, computed at every read and reduce. Auto-faint/death is just the terminal rung being
  crossed by elapsed time — no scheduled per-entity job exists.
- **Privacy is structural.** No prompt-text / source-code column anywhere. The sensor
  appraises prompts **locally** (`engine.appraisePrompt`) and sends only counts + a coarse
  numeric quality score. The daemon's outbox contains numbers only. See [PRIVACY.md](PRIVACY.md).
- **One compositor.** `apps/app/src/render/compositor.ts` is renderer-agnostic (layer stack
  base → body → head → aura → status); `renderer-pixi.ts` is the only file that imports
  Pixi. The same compositor drives the live creature, leaderboard avatars, and the share card.
  The engine never imports Pixi.

## Auth

Convex Auth with **two methods**:

- **Password (email + password)** — the default; in-app form, no browser, works out of the
  box on the local deployment.
- **GitHub OAuth** — for a verified/public leaderboard identity. **Deferred for now** (email/
  password is the working default). To enable: create a GitHub OAuth App with callback
  `http://127.0.0.1:3211/api/auth/callback/github` (`CONVEX_SITE_URL` + `/api/auth/callback/github`),
  then `npx convex env set AUTH_GITHUB_ID <id>` and `AUTH_GITHUB_SECRET <secret>`.

Password policy: **minimum 8 characters** (configured in `convex/auth.ts`).

**One machine-shared session.** The token lives in `~/.agent-idle/auth.json` (owner-only `0600`)
and is the source of truth for the app, the CLI, and the daemon. The **daemon's loopback port is
the shared receiver** — the app's React frontend is the only real Convex Auth client (we never
hand-roll OAuth); after sign-in it posts its token to the daemon (`POST /auth-token`), and
everyone reads it back (`GET /token`). `agent-idle remove` clears the session everywhere.

## License & attribution

- **Source code** is licensed under **[AGPL-3.0-only](LICENSE)**. If you run a modified version
  as a network service, you must offer your users the corresponding source.
- **Bundled art and audio keep their own, separate licenses** — they are not under the AGPL.
  See **[ATTRIBUTION.md](ATTRIBUTION.md)** for the full per-asset breakdown, authors, and
  obligations. The game art (Pixel Crawler by Anokolisa, LPC gear) is used under permissive
  asset licenses; supporting the authors by buying the packs is appreciated.

## Contributing

Contributions are welcome — start with **[CONTRIBUTING.md](CONTRIBUTING.md)**. The short version:
Node ≥ 22, `pnpm install && pnpm dev`, and `pnpm run ci` must pass. Keep the engine pure and
never add prompt-text/source-code fields to any schema. Please follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Known limitations & open questions

1. **Prompt quality in the competitive score.** `avgPromptQuality` is computed client-side
   from prompt text (privacy forbids sending text), so the server can't verify it — an
   unbounded cheat vector if weighted into rank. **Default: quality drives the PET only**
   (fill/mood/status); it is excluded from TrainerScore via
   `engine SCORING.includePromptQualityInScore = false`. Flip only once a server-recomputable
   quality signal exists.
2. **Convex local → cloud / self-hosted-Postgres.** Running a local deployment now; the code
   is identical for cloud or self-hosted. Configure production auth env vars when you switch.
3. **Asset attribution.** Game art ships under permissive licenses; credits are in
   [CREDITS.md](CREDITS.md) / [ATTRIBUTION.md](ATTRIBUTION.md). Still open: reconcile the LPC
   per-author credits against the generator's `CREDITS.csv`.
4. **Decay thresholds + default failure mode.** Thresholds live in `engine config.ts`
   (`DECAY`): full→empty in 16h, then 24h grace before terminal. Default mode is
   `faint`-and-recover; permanent death only in Hardcore.

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
