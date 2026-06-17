# 🥚 Agent Idle

> *A tiny creature lives on your second monitor. It eats your prompts. Feed it well.*

Agent Idle is an **ambient desktop pet for developers**, fed by your real coding-agent
usage. A little critter naps on a spare monitor, perks up and **eats when you prompt** your
coding agent (a thoughtful prompt is a gourmet meal; *"make it pop"* is junk food 🍔), grows
**visible cosmetic armor** as you ship, and climbs a credible **public leaderboard**.

Think Tamagotchi, but the food is good engineering. 🐣⚔️

```
        (\_/)        "another prompt? for me? 🥹"
        (• . •)
       /  >🍪        ← fed by Claude Code / Codex, scored locally
```

> ### 🔒 Your prompts never leave your machine. Promise.
> The sensor scores your prompts **locally** and sends only a **numeric quality score and a
> few counts**. There is no prompt-text or source-code column *anywhere* in the backend — it's
> a **structural** guarantee, not a pinky-promise in a policy doc. → **[PRIVACY.md](PRIVACY.md)**

> **🚧 Status: Phase 0.** This repo is the scaffold + a fully-tested pure engine (the
> creature's *brain*). Everything around the brain is a working skeleton with clearly-marked
> `STUB`/`TODO`s. The pet is alive; the wardrobe is still being sewn.

---

📖 Architecture deep-dive → [CLAUDE.md](CLAUDE.md) · behavior rules → [AGENTS.md](AGENTS.md)
🔒 Data & trust → [PRIVACY.md](PRIVACY.md) · vulns → [SECURITY.md](SECURITY.md)
🤝 Contributing → [CONTRIBUTING.md](CONTRIBUTING.md) · conduct → [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
⚖️ Code under **AGPL-3.0** ([LICENSE](LICENSE)) · art keeps its own licenses ([ATTRIBUTION.md](ATTRIBUTION.md)) · [CREDITS.md](CREDITS.md)

## 🍪 How the little guy eats

1. You prompt your coding agent (Claude Code or Codex).
2. A trivial hook fires and whispers to a local **daemon** — *fire-and-forget, never slows you down*.
3. The daemon **appraises the prompt on your machine** and ships only numbers to the backend.
4. Your pet munches, its mood and armor update, and the leaderboard takes note. 🏆

The same creature can live on **several machines at once** and stay perfectly in sync — because
all the math lives in one pure engine that runs *identically* everywhere (more below).

## 🗺️ Where everything lives

```
agent-idle/
├── packages/engine/   # 🧠 pure TS reducer — the brain. No DOM/Node/fetch. Fully unit-tested.
├── convex/            # 👑 authoritative state + realtime sync (LOCAL deployment) + Convex Auth
├── apps/app/          # 🎨 Tauri (React + Vite + PixiJS): UI, renderer, compositor
├── apps/cli/          # 🛰️  agent-idle CLI: setup, remove, headless sensor daemon
├── sprites/           # 🐉 game art — third-party packs, see ATTRIBUTION.md for licenses
└── scripts/           # 🧪 engine-purity guardrail + asset bake scripts
```

The engine is imported **identically** by all three runtimes — Convex mutations (the
authority), the CLI daemon (local appraisal), and the app (instant preview) — so the same math
runs everywhere. That's the trick that keeps multiple machines on one account consistent. ✨

## 🧰 What you'll need

- 🟢 **Node ≥ 22** (`nvm use 22`; make it stick with `nvm alias default 22`). On Node 20, TS/Convex steps fail in confusing ways.
- 📦 **pnpm** (this repo uses pnpm workspaces).
- 🦀 **Rust + Tauri prerequisites** — *only* to run the desktop app as a native window (`tauri dev`). The web frontend builds without it → <https://tauri.app/start/prerequisites/>.
- ☁️ **Convex** runs a **local** deployment for dev — no cloud account required.

## 🚀 Install, build, test

```bash
pnpm install
pnpm dev             # 🎬 everything at once: convex dev + engine watch + CLI watch + app vite
pnpm build           # 🏗️  turbo run build (builds packages/engine → dist first via ^build)
pnpm test            # 🧫 engine unit tests
pnpm run ci          # ✅ engine purity + typechecks + convex typecheck + engine tests
```

`pnpm dev` is the everyday loop: it spins up the local Convex deployment, recompiles the engine
and the **CLI** continuously (so hook changes go live), and serves the app frontend.

<details>
<summary>🤔 Why a build step before the CLI? (build order)</summary>

The engine ships as built JS (`packages/engine/dist`) because the CLI runs under plain Node,
which can't import `.ts`. Turbo's `^build` dependency builds the engine before app/cli for
`build`/`typecheck`/`test`/`dev`, so `pnpm dev` and `pnpm build` handle ordering automatically.
`dist/` is gitignored. (Only relevant if you invoke a package's `tsc`/`vite`/`convex` directly,
outside Turbo.)
</details>

## 🎮 Run it

```bash
# 👑 Convex (local deployment — authoritative state + realtime + auth)
pnpm convex:dev                                   # or: npx convex dev

# 🎨 App (web frontend in the browser)
pnpm --filter @agent-idle/app dev
# 🖥️  App (native ambient window — needs Rust/Tauri)
pnpm --filter @agent-idle/app tauri dev

# 🛰️  CLI
pnpm --filter @agent-idle/cli build
node apps/cli/dist/index.js <setup [claude] [codex] | status | remove | kill>
```

**First run, the happy path:** `convex dev` → `agent-idle setup` (pick your agent(s), register
the hook, sign in via the browser). The sensor **daemon auto-starts** the first time a hook
fires and quietly stays running — you never launch it by hand (`agent-idle daemon` is just for
foreground debugging). Then go write some code and watch your buddy wake up. 🐾

## 🏛️ Locked architectural decisions

- 👑 **Convex is the authority.** Clients never write totals — they emit events, and `convex/events.ts:ingestEvent` validates + reduces them with the engine. `getAccountState` is the reactive read every client subscribes to.
- 🔑 **Auth = Convex Auth + GitHub.** Trust comes from `ctx.auth.getUserIdentity()` — no hand-rolled OAuth, no per-account HMAC secret.
- ⏳ **Lazy decay, no tick.** `engine.decay(snapshot, now)` is a pure function of elapsed time, computed at every read. Auto-faint/death is just the terminal rung crossed by time — there is *no* scheduled per-entity job.
- 🔒 **Privacy is structural.** No prompt-text / source-code column exists. The sensor appraises prompts **locally** (`engine.appraisePrompt`) and sends only counts + a coarse quality score. The outbox holds numbers only. → [PRIVACY.md](PRIVACY.md)
- 🎭 **One compositor.** `apps/app/src/render/compositor.ts` is renderer-agnostic (layer stack base → body → head → aura → status); `renderer-pixi.ts` is the *only* file that touches Pixi. The same compositor draws the live creature, leaderboard avatars, *and* the share card. The engine never imports Pixi.

## 🔑 Auth, briefly

Convex Auth with **two methods**:

- 📧 **Password (email + password)** — the default; in-app form, no browser, works out of the box on the local deployment. (Minimum 8 characters, set in `convex/auth.ts`.)
- 🐙 **GitHub OAuth** — for a verified/public leaderboard identity. **Deferred for now.** To enable: create a GitHub OAuth App with callback `http://127.0.0.1:3211/api/auth/callback/github` (`CONVEX_SITE_URL` + `/api/auth/callback/github`), then `npx convex env set AUTH_GITHUB_ID <id>` and `AUTH_GITHUB_SECRET <secret>`.

**One machine-shared session.** The token lives in `~/.agent-idle/auth.json` (owner-only `0600`)
and is the single source of truth for the app, CLI, and daemon. The **daemon's loopback port is
the shared receiver** — the app's React frontend is the only real Convex Auth client (we never
hand-roll OAuth); after sign-in it posts its token to the daemon (`POST /auth-token`) and
everyone reads it back (`GET /token`). `agent-idle remove` evicts the session everywhere.

## ⚖️ License & art

- 📜 **Source code** → **[AGPL-3.0-only](LICENSE)**. Run a modified version as a network service and you must offer your users the corresponding source.
- 🎨 **Bundled art & audio keep their own, separate licenses** — *not* under the AGPL. Full per-asset breakdown, authors, and obligations live in **[ATTRIBUTION.md](ATTRIBUTION.md)**. The game art (Pixel Crawler by Anokolisa, LPC gear) is used under permissive asset licenses — buying the packs to support the artists is a lovely thing to do. 💛

## 🤝 Contributing

Contributions very welcome — start with **[CONTRIBUTING.md](CONTRIBUTING.md)**. The short version:
Node ≥ 22, `pnpm install && pnpm dev`, and `pnpm run ci` must pass. **Keep the engine pure** and
**never add prompt-text / source-code fields to any schema** — those two rules are sacred. Be
kind; follow the [Code of Conduct](CODE_OF_CONDUCT.md). 🌱

## 🚧 Still in the workshop (Phase 0 boundary)

- 🏆 **Leaderboard** — flat global sort by score (`convex/leaderboard.ts`). TODO: scopes, weekly resets, Open vs Verified tiers, visibility filtering.
- 🧹 **`sweepStale` cron** — present but **off by default** (`convex/crons.ts`). There is no tick.
- 🖼️ **Share card** — `sharecard.ts` builds a Scene through the compositor but exports no image yet.
- 👕 **Cosmetic sprites** — only base species sheets (Knight/Wizard/Rogue) load; cosmetic layers and walk/hit/collect animations fall back to idle.
- 🔢 **Token attribution** — daemon reads the transcript's last-turn usage (an approximation); `linesAuthored` is 0.
- 🌐 **Standalone CLI OAuth** — `login` currently drives the browser via the app; a localhost callback flow is a TODO.

<details>
<summary>🤓 A note on prompt quality &amp; cheating</summary>

`avgPromptQuality` is computed *client-side* from prompt text (privacy forbids sending the
text), so the server can't verify it — which would be an unbounded cheat vector if it counted
toward rank. So by default **quality drives the PET only** (fill / mood / status) and is
**excluded** from the competitive TrainerScore (`engine SCORING.includePromptQualityInScore =
false`). We'll only flip it on once a server-recomputable quality signal exists.
</details>

## ✅ Phase 0 acceptance (all green)

`pnpm test` proves the brain works: 10 idle hours → hungrier; long neglect past threshold →
fainted (default) / dead (Hardcore); a gourmet prompt fills it up and scores high; *"make it
pop"* → confused and low. All pure functions of `(snapshot, now)`, zero UI/IO. 🧠💚

---

<p align="center"><em>Be nice to your agent. It's hungry. 🐣</em></p>
```
