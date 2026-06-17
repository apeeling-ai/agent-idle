# Release & Distribution Pipeline — Tier 1 Plan

Status: **planned, not implemented.** Scope approved by owner: **Tier 1 only**
(signed desktop builds + Tauri auto-updater + `npx agent-idle`). Modeled on
[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)'s release orchestration —
note t3code is Electron (electron-builder / electron-updater), so we copy its
**orchestration shape**, not its bundler. Our bundler is
[`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) + Tauri's
native updater.

## Facts this plan depends on

- **Repo slug:** `apeeling-ai/agent-idle`
- **Updater endpoint:** `https://github.com/apeeling-ai/agent-idle/releases/latest/download/latest.json`
- **Toolchain present locally:** Tauri CLI `2.11.2`, Rust `1.96`.
- ⚠️ **Local Node is v20** — CI and all release/publish work must `nvm use 22`
  (per `CLAUDE.md`, wrong Node silently fails TS/Convex steps).
- **App:** `apps/app`, Tauri 2, `productName "Agent Idle"`, identifier
  `com.agentidle.app`, version `0.1.0`, `bundle.targets: "all"`.
- **CLI:** `apps/cli`, thin dispatcher, NodeNext, deps `@agent-idle/engine`
  (`workspace:*`), `@clack/prompts`, `convex`. Currently `private: true`, `0.0.0`,
  bin `agent-idle` → `./dist/index.js`.
- **Apple Developer Team:** `VQ3F3K6442` (already in the iOS project).

## End state

Push a tag `v0.1.1` → one workflow produces:

- signed **macOS** DMG (arm64 + x64),
- signed **Windows** NSIS `.exe`,
- **Linux** `.AppImage` + `.deb`,
- the updater `latest.json` (+ `.sig` artifacts),
- a **GitHub Release** with all artifacts attached,
- **npm** publish of the CLI so `npx agent-idle` works.

Installed desktop apps self-update from the Release.

---

## Channels in Tier 1

1. **GitHub Releases** — signed DMG + EXE + AppImage/deb. Foundation; every other
   channel pulls artifacts from here.
2. **Tauri auto-updater** — desktop apps self-update from the Release `latest.json`.
3. **npm** — `npx agent-idle` (the CLI / sensor daemon — the real product entry point).

Tier 2 (Homebrew cask, iOS TestFlight) and Tier 3 (winget, AUR, Android) are **out
of scope** but the pipeline is built to slot them in later without rework (channels
skip gracefully when their secrets/config are absent — the t3code pattern).

---

## Workstream A — Desktop bundle & signing config

**Files:** `apps/app/src-tauri/tauri.conf.json`, `Cargo.toml`, `capabilities/default.json`

1. `tauri.conf.json` → `bundle`:
   - add `"createUpdaterArtifacts": true` (emits the `.sig` files the updater needs).
   - `macOS`: `minimumSystemVersion`; signing identity supplied via CI env (no secret
     in the file). Notarization is handled by env vars, not a config field.
   - `windows`: keep `nsis` target; add an `nsis` config block (installer mode).
   - keep `targets: "all"`.
2. No Rust code change for signing.

## Workstream B — Auto-updater

**Files:** `Cargo.toml`, `apps/app/package.json`, `capabilities/default.json`,
`tauri.conf.json` (`plugins.updater`), `apps/app/src-tauri/src/lib.rs`, one small
frontend module.

1. Rust deps: `tauri-plugin-updater = "2"` + `tauri-plugin-process` (relaunch);
   register both in `lib.rs`.
2. JS deps: `@tauri-apps/plugin-updater` + `@tauri-apps/plugin-process`.
3. `capabilities/default.json`: add `updater:default`, `process:allow-restart`.
4. **Generate the minisign keypair** (`tauri signer generate`, written **outside**
   the repo, e.g. `~/.tauri/agent-idle-updater.key`). Public key →
   `plugins.updater.pubkey` in config; private key + password → GitHub secrets
   (owner stores them; the private key is never committed or echoed).
5. `plugins.updater.endpoints` → the GitHub `latest.json` URL above.
6. Small frontend check-on-launch (silent: check → download → relaunch), behind a
   quiet prompt. This is the only new app code.

## Workstream C — Release workflow

**File (new):** `.github/workflows/release.yml`

- **Triggers:** push tag `v*.*.*` + `workflow_dispatch`.
- **Job `build` (matrix):** `macos-latest` (arm64), `macos-13` (x64),
  `windows-latest`, `ubuntu-22.04`. Node 22 + pnpm + Rust toolchain + Linux AppImage
  system deps (`libwebkit2gtk-4.1`, etc.).
- Uses **`tauri-apps/tauri-action`** with `tagName`/`releaseName` and per-target
  `args`. It builds, signs (when env present), generates + uploads `latest.json`, and
  creates the GitHub Release.
- **Signing via env, conditional (graceful skip if a secret is absent):**
  - macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
    `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` (notarize; team `VQ3F3K6442`).
  - Windows: Azure Trusted Signing secrets (t3code path) **or** unsigned at first —
    open decision #1.
  - Updater: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- **Job `publish_cli`:** Node 22, build, `npm publish` (Workstream D), gated on
  `NPM_TOKEN`. Mirrors t3code's `publish_cli`.

## Workstream D — npm CLI (`npx agent-idle`)

**Files:** `apps/cli/package.json`, new `apps/cli/tsup.config.ts`,
`packages/engine/package.json`.

- Approach: **bundle the engine into the CLI** with tsup — one publishable package,
  `convex` kept external. Avoids co-publishing / lockstep-versioning the engine.
- `apps/cli/package.json`: drop `"private": true`; set a real version; add
  `"files": ["dist"]`, `"publishConfig": { "access": "public" }`,
  `"prepublishOnly": "pnpm build"`; switch build to tsup; drop the `workspace:*`
  engine dep (it gets bundled).
- **Privacy gate:** keep `lint:engine-purity` green; the bundled CLI must still ship
  only the local **numeric** appraiser — no prompt/source text leaves the machine.
- Naming: for `npx agent-idle` (unscoped) to resolve, either rename the package to
  unscoped `agent-idle` or publish a thin `agent-idle` shim that depends on
  `@agent-idle/cli` — open decision #2.

## Workstream E — Version sync

**File (new):** `scripts/set-version.mjs`; add a `version:check` to `pnpm run ci`.

- Single source stamps: `tauri.conf.json`, `Cargo.toml`, `apps/app/package.json`,
  `gen/apple/.../Info.plist`, `apps/cli/package.json`. Today these are hand-aligned at
  `0.1.0`; this prevents drift and is what the tag-release reads.

---

## Secrets to add (GitHub repo → Settings → Secrets and variables → Actions)

| Secret | For | Who provides |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) | updater signatures | generated here; owner stores |
| `APPLE_CERTIFICATE` (+ password, identity) | macOS code sign | owner (export Developer ID cert) |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | macOS notarize | owner |
| Azure Trusted Signing (7 vars) | Windows sign | owner — *or skip (unsigned)* |
| `NPM_TOKEN` | npm publish | owner |

## Open decisions (do not block scaffolding)

1. **Windows signing:** Azure Trusted Signing now, or ship Windows unsigned first and
   add signing later?
2. **`npx agent-idle` name:** rename CLI package to unscoped `agent-idle`, or publish a
   thin `agent-idle` wrapper and keep `@agent-idle/cli`?

## Build / verify gotchas baked in

- CI Node **22** (local is 20 — silently fails TS/Convex otherwise).
- macOS needs **two runners** (arm64 + x86_64) — Tauri doesn't cheaply cross-compile a
  true universal binary.
- Linux AppImage needs the `webkit2gtk` apt deps on the runner.
- `dist/` is gitignored everywhere → every publish/release job must build fresh
  (`prepublishOnly` for the CLI; `tauri-action` builds the app).
- `Developer ID` (direct DMG distribution) ≠ App Store cert — Tier 1 uses Developer ID.

## Suggested sequencing

1. **E** — version sync (small; unblocks tagging).
2. **A + C unsigned** — prove the matrix builds DMG/EXE/AppImage into a draft Release.
3. **B** — updater plugin + keypair + `latest.json`.
4. **A + C signed** — wire macOS (and Windows) signing secrets.
5. **D** — npm CLI publish job.
