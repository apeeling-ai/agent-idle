# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Behavioral guidelines (think before coding, simplicity first, surgical changes,
goal-driven execution) live in `AGENTS.md` — read it. Product vision is in
`docs/promptmon_overview.html` ("Promptmon" is the old name for Agent Idle).

## Environment

- **Requires Node ≥ 22.** Use `nvm use 22` (or `nvm alias default 22`). The system default
  may be Node 20 — commands will mysteriously fail TS/Convex steps on the wrong version.
- pnpm workspaces. **Rust/Tauri is not assumed installed** — the app's web frontend builds
  without it, but `tauri dev` (native window) needs the Tauri prerequisites.

## Commands

```bash
pnpm install
pnpm dev                            # Turborepo: convex dev + engine watch + CLI tsc --watch + app vite
pnpm build                          # turbo run build (builds engine → dist first via ^build)
pnpm test                           # turbo run test (engine unit tests, Vitest)
pnpm run ci                         # engine-purity + turbo typecheck + convex typecheck + turbo test
pnpm --filter @agent-idle/engine exec vitest run src/decay.test.ts   # a single test file

pnpm convex:dev                     # local Convex deployment (npx convex dev)
pnpm convex:typecheck               # tsc over convex/

pnpm --filter @agent-idle/app dev          # app web frontend (Vite)
pnpm --filter @agent-idle/app tauri dev    # native ambient window (needs Rust)

pnpm --filter @agent-idle/cli build && node apps/cli/dist/index.js <setup|login|logout|daemon|ui|hook>
```

There is no repo-wide lint beyond `lint:engine-purity`; "lint" here means typecheck + that
guardrail, all bundled in `pnpm run ci`.

## Architecture — the load-bearing ideas

**One pure engine, three runtimes.** `packages/engine` is a pure, headless TS reducer (no
DOM/Node/fetch). It is imported *identically* by the Convex authority, the CLI daemon, and
the app, so the same math runs everywhere — this is what keeps multiple machines consistent.
Never put IO, timers, or platform APIs in the engine. The frozen contract is `events.ts`
(`Event` + `apply`) and `entities.ts`; changing those ripples to all consumers.

**The server is the only writer of canonical state.** Clients never write totals. They emit
events; `convex/events.ts:ingestEvent` authenticates the caller, dedups by `clientEventId`,
checks rate ceilings, appends to the append-only `eventLedger`, then runs `engine.decay` +
`engine.apply` and writes derived state. `getAccountState` (query, no args, identity-scoped)
is the reactive read every client subscribes to.

**Lazy decay — there is no tick.** `engine.decay(snapshot, now)` derives liveness purely from
elapsed time, at every read and reduce. Auto-faint/death = the terminal rung crossed by
elapsed time. Do not add a per-entity scheduled job; `convex/maintenance.ts:sweepStale` is an
off-by-default batch for side effects only, not a tick.

**Privacy is structural.** No prompt-text / source-code column exists in any schema. The
sensor appraises prompts *locally* (`engine.appraisePrompt`) and only a numeric quality score
+ counts ever leave the machine. Don't add fields that would carry prompt/code text.

**Auth = Convex Auth (Password + GitHub); per-machine sessions via a device grant.** Trust is
`ctx.auth.getUserIdentity()` (no HMAC, no hand-rolled OAuth). Providers in `convex/auth.ts`:
`Password` (email+password, default), `GitHub` (OAuth; needs `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`
via `npx convex env set`), and a `ConvexCredentials` provider `id:"device"` for the CLI/app.
`convex/lib/auth.ts` resolves identity → account (`ensureAccount`/`currentAccount`), keyed by the
stable user id so every surface of one person shares ONE account.

Each surface holds its OWN Convex Auth session (its own rotating refresh-token chain) — they must,
because Convex Auth kills a chain if two clients refresh it (theft detection). Sessions are
established by an **RFC-8628-style device grant** (`convex/deviceAuth.ts`): the machine registers a
code (secret `deviceId` it keeps + human `userCode` for the URL); the signed-in browser at the
`/device` page calls `deviceAuth.approve({userCode})` — a plain mutation that mints/deletes NOTHING,
so the browser keeps its own session; the machine polls `deviceAuth.status`, then completes its
**own** sign-in via `auth:signIn({provider:"device", params:{deviceId}})`, which redeems the code
(single-use) and returns `{token, refreshToken}` straight to the machine — no token ever transits
the browser or the DB. The CLI stores `{token, refreshToken}` in `~/.agent-idle/auth.json` and the
daemon SELF-REFRESHES via `auth:signIn({refreshToken})` (see `apps/cli/src/daemon.ts`
`ensureFreshToken`); the app seeds `ConvexAuthProvider` storage and self-refreshes normally. The
daemon posts events to the deployment that MINTED its token (JWT `iss`, see
`config.ts:convexUrlFromToken`), so the auth target and event target can never diverge. Never
reimplement the OAuth exchange or hand-roll session creation — the browser does the supported
Convex Auth flow and `ConvexCredentials` mints the machine session.

**Renderer behind a seam.** `apps/app/src/render/compositor.ts` is renderer- and
Tauri-agnostic (layer stack base → body → head → aura → status). `renderer-pixi.ts` is the
ONLY file that imports Pixi. One compositor serves the live creature, leaderboard avatars,
and the share card — never fork the layer stack. The whole `render/` folder is written to be
extractable into a future `packages/client`.

**CLI sensor flow.** Claude Code hook (`agent-idle hook`, fire-and-forget, exits 0) POSTs the
payload to the long-lived daemon, which **auto-starts** (the hook spawns it detached if the
loopback port is free; a redundant daemon exits on `EADDRINUSE`). The daemon appraises locally
+ reads transcript token counts at `Stop` → enqueues to a durable on-disk outbox
(`~/.agent-idle/outbox.jsonl`) → flusher posts to Convex with retry. Idempotent
`clientEventId` makes re-delivery safe. Keep the hook trivial — all real work is async in the
daemon so Claude Code is never delayed.

## Non-obvious gotchas

- **Build order:** the engine is consumed as built JS (`packages/engine/dist`) because the
  CLI runs under plain Node. Turbo's `^build` dependency builds the engine before app/cli for
  `build`/`typecheck`/`test`/`dev`, so `pnpm dev` / `pnpm build` handle ordering; `dist/` is
  gitignored. (Only matters if you run a package's `tsc`/`vite`/`convex` directly.)
- **Engine purity is enforced** by `scripts/check-engine-purity.mjs` (in `pnpm run ci`): it
  fails the build if `packages/engine/src` imports DOM/Node/network. Comments are stripped
  before scanning, so mentioning a banned API in a comment is fine.
- **`convex/` lives at the repo root** and is the Convex project root (root `package.json`
  depends on `convex` + `@agent-idle/engine`). `convex/_generated` is regenerated by
  `convex dev`/`codegen` and committed.
- **Destructive schema changes need widen → migrate → narrow — NEVER one step.** `convex deploy`
  validates *existing rows* against the new schema, so removing a field (or narrowing a validator)
  in one commit rejects the whole deploy against any populated table — and it's data-dependent, so
  CI + Vercel *preview* (which deploy to empty deployments) stay green while **prod fails**, taking
  the whole Vercel build down with it. Instead: (1) **widen** — deploy the field as `v.optional(...)`
  so it validates against old and new rows; (2) **migrate** — clear/backfill the old rows in
  **every** deployment (dev AND prod; a scheduled cleanup like `convex/crons.ts` handles ephemeral
  tables); (3) **narrow** — drop the field once no old-shaped row remains. The `convex-migration-helper`
  skill plans this. (This exact trap took down a prod deploy once — see `deviceAuthCodes`.)
- **App imports the generated Convex API** via `../../../convex/_generated` (Vite serves it
  via `server.fs.allow`). The **CLI must NOT** import that generated API — its NodeNext
  typecheck bleeds into Convex source. The daemon references the mutation by string with
  `makeFunctionReference("events:ingestEvent")` instead.
- **Sprites** are served at `/sprites` via a symlink `apps/app/public/sprites →
  ../../../sprites` (Pixel Crawler pack; NPC sheets are single-row grids sliced in
  `render/sprites.ts`).
- **Competitive score excludes prompt quality by default** (`engine config.ts`
  `SCORING.includePromptQualityInScore = false`) because it is client-computed and
  server-unverifiable. Don't weight it into rank without a server-recomputable signal.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
