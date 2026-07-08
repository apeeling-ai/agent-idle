# Releasing Agent Idle

One workflow, two channels (`.github/workflows/release.yml`).

## Prod release (npm + desktop)

```bash
git checkout main && git pull
git tag v0.2.0
git push origin v0.2.0
```

That one tag push does everything:

1. **npm** — publishes `@agent-idle/cli@0.2.0` via OIDC trusted publishing (no tokens,
   no OTP). The published bundle bakes in the prod Convex URL + hosted auth page
   (see `apps/cli/tsup.config.ts`); dev `tsc` builds keep localhost defaults.
2. **desktop** — builds the `.dmg` (macOS) and `.exe` (Windows NSIS) against the
   **prod** Convex backend and creates a **draft** GitHub Release with both artifacts.
3. Review the draft under [Releases](https://github.com/apeeling-ai/agent-idle/releases),
   edit the notes, and **Publish**. Nothing is public until you publish the draft.

The tag is the single source of truth for versions — it's injected into the Tauri
manifests and the npm package on the CI runner (`scripts/set-version.mjs`,
`scripts/make-cli-package.mjs`); nothing version-related is committed. Plain semver
tags only (`vX.Y.Z`).

## Preview build (desktop only, dev backend)

```bash
gh workflow run release.yml
```

(or Actions → **Release** → *Run workflow*.) Builds dmg/exe against the **dev**
Convex backend, versioned `0.0.<run#>`, published as a **prerelease** on the rolling
`preview` tag. No npm publish. Use this to smoke-test the desktop build before tagging.

## Backend (Convex) deploys are separate

Merging to `main` deploys the prod Convex functions + web frontend via the Vercel
build (`vercel.json` runs `npx convex deploy`). Tags only build *clients*. Ship
backend-dependent client changes by merging first, then tagging — old clients keep
working (the daemon falls back per-event if the batch endpoint is missing, and the
server dedups redeliveries).

## One-time setup (already done unless noted)

- Repo variables `VITE_CONVEX_URL_PROD` / `VITE_CONVEX_URL_PREVIEW`.
- First npm publish was manual (`@agent-idle/cli@0.1.0`) — trusted publishing can't
  create a package.
- npm **Trusted Publisher** on the
  [`@agent-idle/cli` package settings](https://www.npmjs.com/package/@agent-idle/cli/access):
  GitHub Actions, repo `apeeling-ai/agent-idle`, workflow `release.yml`. The npm job
  fails without it.
- **Code signing:**
  - *macOS* — builds are **ad-hoc signed** by default via
    `bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`, so a downloaded app
    shows the mild "unverified developer → Open Anyway" prompt, not "is damaged".
    (It's config, not env: an empty `APPLE_CERTIFICATE` env makes Tauri attempt and
    fail a keychain import.) To go fully Gatekeeper-clean (no prompt), add these
    repo secrets and uncomment the env block in release.yml — the same run then
    signs with the real identity and notarizes: `APPLE_SIGNING_IDENTITY` (Developer
    ID Application), `APPLE_CERTIFICATE` + `APPLE_CERTIFICATE_PASSWORD` (base64 .p12
    + password), `APPLE_ID` + `APPLE_PASSWORD` (app-specific password) + `APPLE_TEAM_ID`.
  - *Windows* — still unsigned; SmartScreen shows "More info → Run anyway". Enabling
    it needs a cert configured in `apps/app/src-tauri/tauri.conf.json` under
    `bundle.windows.certificateThumbprint` (cert installed in the runner's store) or
    an Azure Trusted Signing `signCommand` — not just a secret.
  - Every release's GitHub notes carry these first-launch steps for end users
    (set via tauri-action `releaseBody`).

## Gotchas

- The npm job builds from the tagged commit, so the published CLI always matches the
  tag. Never retag a moved commit — cut a new patch version.
- Users' daemons are long-lived: after a release, an already-running old daemon keeps
  running old code until it's killed (port 47615) or the machine restarts. Harmless —
  the server dedups and old clients stay compatible — but remember it when a fix
  "isn't live" on your own machine.
- `agent-idle login` opens the hosted HTTPS auth page, which posts the token to the
  daemon's `http://127.0.0.1` loopback. Chrome/Edge/Firefox allow this; Safari may
  block mixed content to loopback — point users at Chrome if login hangs.
