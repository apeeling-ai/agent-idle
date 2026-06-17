# Agent Idle

**Your coding agent is a pixel pet that works for you — and brings home tokens.** It lives on
your second monitor and labors away in real time: when your agent runs a shell command, the pet
mines. When it edits a file, it's at the forge. When it's reading, it's in the grove. When it
needs you, a `?` pops over its head. When a turn errors, it gets knocked out — and gets back up
on the next one.

It's not a progress bar. It's a 16×16 mirror of your Tuesday — a hard-working little pet whose
labor you can watch out of the corner of your eye.

The **tokens** your pet brings home are the yield: they mint coins, climb an unbounded level
badge, dress it in **visible cosmetic armor**, and rank it on a **leaderboard you can't fake**.
(Prompt quality seasons its *mood* — a gourmet prompt vs. a lazy *"make it pop"* that leaves it
Confused — but tokens are what it works for.) Pets you can keep: **Claude Code** and **Codex**.

> ### Privacy is architecture, not a policy.
> Your prompts and source code **never leave your machine**. The sensor appraises prompts
> *locally* and ships only a coarse numeric quality score and a few counts. There is no
> prompt-text or source-code column anywhere in the backend — by design, not by promise. →
> **[PRIVACY.md](PRIVACY.md)**

> **Status: Phase 0** — the scaffold plus a fully-tested pure engine (the brain). Everything
> around it is a working skeleton with clearly-marked `STUB`/`TODO`s.

---

📖 Architecture deep-dive → [CLAUDE.md](CLAUDE.md) · behavior rules → [AGENTS.md](AGENTS.md)
🔒 Data & trust → [PRIVACY.md](PRIVACY.md) · vulns → [SECURITY.md](SECURITY.md)
🤝 Contributing → [CONTRIBUTING.md](CONTRIBUTING.md) · conduct → [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
⚖️ Code under **AGPL-3.0** ([LICENSE](LICENSE)) · art keeps its own licenses ([ATTRIBUTION.md](ATTRIBUTION.md)) · [CREDITS.md](CREDITS.md)

## What it actually does

You put your coding agent to work. A trivial hook fires on each tool call and whispers to a
local **daemon** — fire-and-forget, so the agent is never slowed down. The daemon reads the
*shape* of the work (tool category only — never tool input) and the **token counts**, appraises
prompt quality on your machine, and ships only numbers to the backend. Your pet reacts in real
time — every kind of work it does for you is a different job:

| Your agent is… | …and the pet is… |
|---|---|
| running a shell command | **mining** at a boulder |
| editing a file | at the **forge** (sawmill / chopping) |
| reading or gathering | in the **grove** |
| waiting on a permission | flagging a **`!`** bubble |
| idle, waiting on you | a **`?`** bubble |
| a turn that errored | **knocked out** (up again next turn) |
| session ended | **fainting** |

No labels needed — you read your pet's workday out of the corner of your eye.

## The whole thing is built to be honest

A leaderboard you can lie to is worthless. Three decisions, made in week one, make cheating
structurally hard:

1. **One pure engine, three runtimes.** `packages/engine` is a headless reducer with no DOM, no
   Node, no network — and **CI fails the build the instant anything imports one**. The *same
   math* runs in the Convex backend, the CLI daemon, and the app, so a pet behaves identically
   on every machine you're signed into.
2. **The server is the only writer.** Clients never write totals. They emit events; the server
   dedups by id, appends to an immutable ledger, and reduces it with the engine. Your score is
   *derived from facts*, not asserted by your client.
3. **Privacy is structural.** Prompts are appraised locally; only a single coarse quality number
   ever leaves your machine. No column anywhere could hold prompt text or source code.

And there's **no tick** — liveness is pure math over elapsed time, computed at read:
`lively → weary → drained → fainted → dead → gone`, each rung a time threshold past your last
real work. Your pet can faint while the server sleeps and still be correct the instant you look.
("Lazy decay.")

## Where everything lives

```
agent-idle/
├── packages/engine/   # the brain — pure TS reducer. No DOM/Node/fetch. Fully unit-tested.
├── convex/            # authority: canonical state + realtime sync (LOCAL deployment) + Convex Auth
├── apps/app/          # Tauri (React + Vite + PixiJS): UI, renderer, compositor
├── apps/cli/          # agent-idle CLI: setup, remove, headless sensor daemon
├── sprites/           # game art — third-party packs, see ATTRIBUTION.md for licenses
└── scripts/           # engine-purity guardrail + asset bake scripts
```

## What you'll need

- **Node ≥ 22** (`nvm use 22`; make it stick with `nvm alias default 22`). On Node 20, TS/Convex steps fail in confusing ways.
- **pnpm** (this repo uses pnpm workspaces).
- **Rust + Tauri prerequisites** — *only* to run the desktop app as a native window (`tauri dev`). The web frontend builds without it → <https://tauri.app/start/prerequisites/>.
- **Convex** runs a **local** deployment for dev — no cloud account required.

## Install, build, test

```bash
pnpm install
pnpm dev             # everything at once: convex dev + engine watch + CLI watch + app vite
pnpm build           # turbo run build (builds packages/engine → dist first via ^build)
pnpm test            # engine unit tests
pnpm run ci          # engine purity + typechecks + convex typecheck + engine tests
```

`pnpm dev` is the everyday loop: it spins up the local Convex deployment, recompiles the engine
and the CLI continuously (so hook changes go live), and serves the app frontend.

<details>
<summary>Why a build step before the CLI? (build order)</summary>

The engine ships as built JS (`packages/engine/dist`) because the CLI runs under plain Node,
which can't import `.ts`. Turbo's `^build` dependency builds the engine before app/cli for
`build`/`typecheck`/`test`/`dev`, so `pnpm dev` and `pnpm build` handle ordering automatically.
`dist/` is gitignored. (Only relevant if you invoke a package's `tsc`/`vite`/`convex` directly,
outside Turbo.)
</details>

## Run it

```bash
# Convex (local deployment — authoritative state + realtime + auth)
pnpm convex:dev                                   # or: npx convex dev

# App (web frontend in the browser)
pnpm --filter @agent-idle/app dev
# App (native ambient window — needs Rust/Tauri)
pnpm --filter @agent-idle/app tauri dev

# CLI
pnpm --filter @agent-idle/cli build
node apps/cli/dist/index.js <setup [claude] [codex] | status | remove | kill>
```

**First run, the happy path:** `convex dev` → `agent-idle setup` (pick your agent(s), register
the hook, sign in via the browser). The sensor **daemon auto-starts** the first time a hook
fires and quietly stays running — you never launch it by hand (`agent-idle daemon` is just for
foreground debugging). Then go put your agent to work and watch your pet earn its keep.

## Architecture (locked decisions)

- **Convex is the authority.** Clients never write totals — they emit events, and `convex/events.ts:ingestEvent` validates + reduces them with the engine. `getAccountState` is the reactive read every client subscribes to.
- **Auth = Convex Auth + GitHub.** Trust comes from `ctx.auth.getUserIdentity()` — no hand-rolled OAuth, no per-account HMAC secret.
- **Lazy decay, no tick.** `engine.decay(snapshot, now)` is a pure function of elapsed time, computed at every read. Auto-faint/death is just the terminal rung crossed by time — there is *no* scheduled per-entity job.
- **Privacy is structural.** No prompt-text / source-code column exists. The sensor appraises prompts locally (`engine.appraisePrompt`) and sends only counts + a coarse quality score. The outbox holds numbers only. → [PRIVACY.md](PRIVACY.md)
- **One compositor.** `apps/app/src/render/compositor.ts` is renderer-agnostic (layer stack base → body → head → aura → status); `renderer-pixi.ts` is the *only* file that touches Pixi. The same compositor draws the live pet, leaderboard avatars, and the share card. The engine never imports Pixi.

## Auth, briefly

Convex Auth with **two methods**:

- **Password (email + password)** — the default; in-app form, no browser, works out of the box on the local deployment. (Minimum 8 characters, set in `convex/auth.ts`.)
- **GitHub OAuth** — for a verified/public leaderboard identity. **Deferred for now.** To enable: create a GitHub OAuth App with callback `http://127.0.0.1:3211/api/auth/callback/github` (`CONVEX_SITE_URL` + `/api/auth/callback/github`), then `npx convex env set AUTH_GITHUB_ID <id>` and `AUTH_GITHUB_SECRET <secret>`.

**One machine-shared session.** The token lives in `~/.agent-idle/auth.json` (owner-only `0600`)
and is the single source of truth for the app, CLI, and daemon. The daemon's loopback port is
the shared receiver — the app's React frontend is the only real Convex Auth client (we never
hand-roll OAuth); after sign-in it posts its token to the daemon (`POST /auth-token`) and
everyone reads it back (`GET /token`). `agent-idle remove` evicts the session everywhere.

## License & art

- **Source code** → **[AGPL-3.0-only](LICENSE)**. Run a modified version as a network service and you must offer your users the corresponding source.
- **Bundled art & audio keep their own, separate licenses** — *not* under the AGPL. Full per-asset breakdown, authors, and obligations live in **[ATTRIBUTION.md](ATTRIBUTION.md)**. The game art (Pixel Crawler by Anokolisa, LPC gear) is used under permissive asset licenses; buying the packs to support the artists is appreciated.

## Contributing

Contributions welcome — start with **[CONTRIBUTING.md](CONTRIBUTING.md)**. The short version:
Node ≥ 22, `pnpm install && pnpm dev`, and `pnpm run ci` must pass. **Keep the engine pure** and
**never add prompt-text / source-code fields to any schema** — those two rules are load-bearing.
Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Still in the workshop (Phase 0 boundary)

- **Leaderboard** — flat global sort by score (`convex/leaderboard.ts`). TODO: scopes, weekly resets, Open vs Verified tiers, visibility filtering.
- **`sweepStale` cron** — present but **off by default** (`convex/crons.ts`). There is no tick.
- **Share card** — `sharecard.ts` builds a Scene through the compositor but exports no image yet.
- **Cosmetic sprites** — only base species sheets (Knight/Wizard/Rogue) load; cosmetic armor layers and walk/hit/collect animations fall back to idle.
- **Token attribution** — daemon reads the transcript's last-turn usage (an approximation); `linesAuthored` is 0 (cut on purpose — see below).
- **Standalone CLI OAuth** — `login` currently drives the browser via the app; a localhost callback flow is a TODO.

<details>
<summary>Why tokens, not lines of code — and why quality doesn't count toward rank</summary>

**No "lines of code."** It isn't server-verifiable without seeing the code (which never leaves
your machine, by design) and it rewards volume over thought. **Tokens fed** + worked turns +
streak tell a truer, honest story.

**Quality drives the pet, not the score.** `avgPromptQuality` is computed *client-side* from
prompt text, so the server can't verify it — an unbounded cheat vector if weighted into rank. By
default quality drives the PET only (fill / mood / status) and is **excluded** from the
competitive TrainerScore (`engine SCORING.includePromptQualityInScore = false`). It flips on only
once a server-recomputable quality signal exists.
</details>

## Phase 0 acceptance (all green)

`pnpm test` proves the brain: 10 idle hours → hungrier; long neglect past threshold → fainted
(default) / dead (Hardcore); a gourmet prompt fills it and scores high; *"make it pop"* →
confused and low. All pure functions of `(snapshot, now)`, zero UI/IO.
