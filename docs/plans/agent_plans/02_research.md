# Agent 02 — Research (Reusable Tech)

> Greenfield is locked: we build our *own* architecture. Greenfield ≠ from scratch —
> we still adopt mature libraries. This agent's job is to choose them well and to
> mine existing projects for technique, not to fork. Findings below are current as of
> mid-2026 and should be re-verified at build time.

---

## 1. Mandate

Delete work before it's written. Survey what exists — frameworks, libraries,
reference projects, backend services — and produce per-layer build-vs-buy
recommendations so the team builds only what's genuinely novel (the progression,
the sync, the leaderboard credibility) and adopts the rest.

## 2. Method

For each layer: identify the leading options, weigh against our constraints (pure
engine, server-authority, cross-platform, low cost, exit-safe), and recommend. Where
a recommendation is non-obvious, prescribe a time-boxed spike rather than a guess.

## 3. Findings & recommendations by layer

### 3.1 Desktop shell — **Tauri 2 (adopt)**
Tauri 2 (current v2.10.x) targets Linux/macOS/Windows *and* Android/iOS from one web
frontend, producing ~8MB binaries. It's the standard choice for a transparent,
frameless, always-on-top desktop pet.

**Reference to study, not fork:** `IMMINJU/claude-pet` (GitHub) — an open-source
Tauri 2 pet that already reacts to Claude Code in real time (transparent, frameless,
always-on-top, auto-registers Claude Code hooks, themeable, multi-session). We go
greenfield, but its **hook-integration approach and its window config are worth
reading closely.** A separate Tauri-v2 pixel-pet copilot project documents the
transparent-window pitfalls in detail.

**Known pitfalls to budget for (from the reference projects):**
- Transparent-window **click-through / mouse passthrough** — handled via
  `set_ignore_cursor_events`; needed so clicks on empty pixels pass to the app behind.
- macOS quirk: clicking a fully transparent (alpha=0) pixel behaves oddly; the
  reference projects show the workaround.
- Windows positioning extras available via `tauri-plugin-wallpaper` if we ever want
  wallpaper-layer or Win+D-surviving behavior.

### 3.2 Renderer — **Canvas for v1, PixiJS as it grows (adopt)**
PixiJS is a *rendering library*, not a game framework: fast WebGL 2D drawing
(~150KB core, sprite batching, filters, masks), used by Disney/Google/BBC. It maps
exactly onto our "renderer" layer and our layered compositor. Plain Canvas is fine
for the single-sprite v1; adopt PixiJS once cosmetics/zones multiply.

**Phaser** is the full game framework (physics, scenes, input, audio). Overkill for
the pet; the right reach *later* for Path B zone minigames. Do not pull it in early.

### 3.3 Backend — **build our own (Hono + Postgres)**
Our anti-cheat is a custom append-only event ledger with server-side reduction; this
doesn't fit neatly inside a turnkey BaaS. Recommendation: own the service.
- **Hono on Node** for REST + WebSocket.
- **Postgres** for the ledger + derived stats (SQLite locally as offline cache).

### 3.4 Leaderboard ranking — **spike before hand-rolling (D2)**
Efficient "around-me" ranking and time-windowed/seasonal boards are the genuinely
hard part and are exactly what purpose-built services do well. Options surveyed:
- **Supabase** — open-source, Postgres + realtime + auth, self-hostable. Gives
  primitives, not leaderboard features; you build ranking yourself. Fits our custom
  model and keeps everything in one Postgres.
- **Nakama** (Heroic Labs) — open-source, self-hostable, server-authoritative, with
  leaderboards/auth/storage built in. Strong if we want ranking out of the box.
- **PlayFab** (Microsoft) — enterprise, consumption-priced, very capable, heavier.
- **LootLocker / Talo / Beamable** — hosted, server-authoritative leaderboards +
  progression out of the box; fast but adds a dependency + exit risk.

**Recommendation:** keep auth + ledger + stats in our own Hono+Postgres; **time-box a
2-day spike** comparing (a) hand-rolled ranked queries in Postgres vs (b) Nakama's
leaderboard module fronting our verified stats. Pick on the strength of around-me +
seasonal query ergonomics. Bias to open-source/self-hostable for exit safety.

### 3.5 Identity — **GitHub OAuth (adopt)**
Standard, and it doubles as the avatar source and the one-account anti-cheat anchor.

### 3.6 Mobile shell — **Capacitor (adopt, later)**
Wraps the same web renderer to iOS/Android with minimal new code. React Native only
if a more native feel later justifies the cost.

### 3.7 Sensors — **Claude Code hooks (adopt the mechanism)**
Official lifecycle hooks (`UserPromptSubmit`, `PostToolUse`) are the clean,
documented path. Build our own signed poster; study claude-pet's auto-registration
for UX.

## 4. Cost & licensing scan (deliverable)

For each adopted dependency, record: license (MIT/Apache preferred), hosting cost at
small scale, self-host option (exit safety), and maturity. Flag anything copyleft or
any closed service whose shutdown would brick us.

## 5. Deliverables

- One-page build-vs-buy recommendation per layer (this document, ratified by Agent 01).
- The D2 spike result with a clear ranking-layer decision.
- A licensing/cost table for every adopted dependency.
- A short "techniques to borrow from claude-pet" note (hooks, window config,
  passthrough) — explicitly *technique transfer, not code fork*.

## 6. Handoffs

- → Architect: ratifies build-vs-buy and records D2.
- → Frontend: shell + renderer choices + the passthrough pitfalls.
- → Networking/Leaderboards: backend + ranking decision.
- → Engine: confirmation that nothing adopted forces impurity into the engine.

## 7. Open decisions surfaced

- **D2** ranking-layer (custom vs Nakama) — owned here via the spike.
- Self-host vs managed for Postgres/realtime at launch scale (cost vs ops).

## 8. Definition of done

Every layer has a recommendation with rationale and license/cost; the D2 spike is
run and decided; the Architect has ratified; no adopted dependency violates engine
purity or the no-content privacy invariant.
