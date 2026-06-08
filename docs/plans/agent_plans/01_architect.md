# Agent 01 — Architect (Mastermind)

> **Context locked for all agents:** Greenfield — we own our architecture and
> codebase (we still use standard libraries/frameworks; we do *not* fork
> claude-pet). **Open decision carried in-plan:** the failure state (faint-and-recover
> vs permanent death) is deliberately unresolved; every plan that touches it must
> support both until it's decided. See §9.

---

## 1. Mandate

Own the *seams*. Nine other agents build in parallel; the Architect makes sure their
outputs compose into one coherent product instead of nine incompatible halves. The
Architect writes the least feature code and the most *contract* — the data shapes,
event formats, and sequencing that everyone else codes against. If two agents
disagree on an interface, the Architect's contract wins.

The Architect is also the keeper of the product's spine: the three non-negotiables,
the differentiation guardrail, and the open-decision register.

## 2. Scope

**In scope:** the data model, the event model, the module/package boundaries, the
build sequence and dependency graph, build-vs-buy calls per layer, the CI rules that
protect the architecture, the open-decision register, and cross-agent arbitration.

**Out of scope:** implementing features inside any single layer (that's the owning
agent), visual design, copy, growth.

## 3. The three non-negotiables (the spine)

1. **The engine is pure.** `packages/engine` imports no DOM, no Node, no `fetch`.
   Consequence: it runs unchanged on desktop, phone, and server. Enforced by CI.
2. **The server is the only authority.** Clients emit *timestamped events*, never
   totals. The server reduces events into stats, scores, unlocks, ranks. Consequence:
   the leaderboard is credible and re-derivable.
3. **Cosmetics are render layers, not redraws.** Adding gear is adding an art asset +
   a rule row. Consequence: armor and seasons scale without touching base sprites.

Any change that breaks one of these is an architecture change and goes through the
Architect, not a quiet PR.

## 4. The contracts (the Architect's primary deliverable)

These are frozen first; nothing downstream starts until they're stable. They live in
`packages/engine` as types so every agent imports the same source of truth.

### 4.1 Entity
```
Entity {
  id: string                 // "buddy"; later "grepzard", "monk_03"
  species: string            // drives art, decay rates, behavior
  name: string               // set once (the "soul")
  resources: Record<string, number>   // { hunger } → later tokens/ore/burnout
  cosmetics: { owned: string[]; equipped: { body?: string; head?: string; aura?: string } }
  status: string | null      // in_the_zone | confused | striking | fainted
  alive: boolean
  lastTick: number           // epoch ms
}
```

### 4.2 Account
```
Account {
  id: string
  githubLogin: string
  visibility: "public" | "friends" | "private"   // default private
  verified: boolean
  seasonStats: Record<string, number>            // reset each season
  lifetimeStats: Record<string, number>          // never reset
}
```

### 4.3 Event (the universal input)
```
Event {
  type: "feed" | "pet" | "delegate" | "claude_used" | "code_authored"
  source: "user_tap" | "claude_code_hook" | "browser" | "api"
  payload: { promptQuality?: number; tokens?: number; linesAdded?: number; zoneId?: string }
  at: number
  idempotencyKey: string     // dedupe across retries
  sig?: string               // HMAC for sensor-originated events
}
```

### 4.4 Save (sync unit)
```
Save { ownerId: string; entities: Entity[]; zones: Zone[]; updatedAt: number }
```

**Privacy invariant (architectural, not optional):** no schema anywhere has a field
for prompt text or source code. The payload carries counts and a coarse quality
score only. This is a structural guarantee the Architect enforces in review.

## 5. Module boundaries (greenfield monorepo)

```
packages/engine     pure logic (types above live here)
packages/renderer   canvas/PixiJS compositor; imports engine
apps/desktop        Tauri shell; hosts renderer + local bus (P1–3)
apps/mobile         Capacitor shell; same renderer (later)
apps/server         authority: ledger, scoring, unlocks, boards
sensors/*           signed event emitters (Claude Code hook first)
```

Rule: dependencies point inward toward `engine`. `engine` depends on nothing.
`renderer` depends only on `engine`. Apps depend on `renderer` + `engine`. The
server depends only on `engine`. No cycles, ever.

## 6. Build-vs-buy calls (greenfield, but not from scratch)

Greenfield is about *our architecture*, not reinventing infrastructure. The Architect
ratifies these (detail in Agent 02 — Research):

- **Shell:** Tauri 2 (own app, standard framework). *Build our code, use the tool.*
- **Renderer:** PixiJS when sprite count warrants; plain Canvas acceptable for v1.
- **Backend:** our own service (Hono + Postgres) — required because our
  append-only-ledger anti-cheat is custom. *Build.*
- **Leaderboard ranking:** spike a purpose-built layer (Nakama/LootLocker) for
  around-me/time-windowed queries before hand-rolling; decision recorded here.
- **Reference, not fork:** study claude-pet's hook integration; inherit nothing.

## 7. Sequencing & dependency graph

```
Engine ─▶ Networking/Server ─▶ Leaderboards
   └─▶ Progression ─┘             ▲
   └─▶ Renderer ─▶ Frontend ──────┘
Research ▶ (informs all, runs first)
Social + Strategy ▶ (parallel, off critical path)
```

**Critical path:** `Engine → Server → Leaderboards`. Everything else parallelizes
against it. The Architect's job is to keep the critical path unblocked — that's where
schedule slips originate.

## 8. CI / guardrails the Architect installs

- **Engine-purity lint:** fail build if `packages/engine` imports DOM/Node/network.
- **No-prompt-text check:** static scan that rejects any schema/field named for raw
  content.
- **Contract tests:** a shared fixture (a save + an event stream) that the engine and
  the server must both reduce to the *same* final state. This is the anti-drift net
  for non-negotiable #2.
- **Determinism test:** replaying an event stream yields a byte-identical save.

## 9. The open-decision register (Architect owns this living list)

| # | Decision | Why deferred | Who needs it | Default until decided |
|---|---|---|---|---|
| D1 | Failure state: faint-recover vs permanent death | Sets whole tone; not yet chosen | UX, Progression, Engine, Social | Engine supports both via a config flag; UX prototypes both |
| D2 | Backend: custom vs game-BaaS for ranking | Needs a spike | Networking, Leaderboards | Custom ledger + spike Nakama for board reads |
| D3 | Name/brand clearance | Legal check pending | Social, Strategy | "Promptmon" working title |
| D4 | Monetization principle | No audience yet | Strategy, Progression | Free; cosmetic-only if ever |
| D5 | Season length & reset rules | Tune post-launch | Progression, Leaderboards | 6–8 weeks |

**D1 handling rule:** the engine exposes `failureMode: "faint" | "death"` as config;
no agent hard-codes either. This keeps the deferral cheap.

## 10. Risks the Architect actively manages

- **Critical-path concentration on the backend (mostly Thijmen).** No second backend
  dev to absorb a stall. Mitigation: keep the contracts tight so the server is the
  *only* hard part, and front-load the Research spike (D2).
- **Contract drift.** Mitigation: contract + determinism tests in CI (§8).
- **Scope collapse into "just a terminal pet."** Mitigation: the differentiation
  guardrail — every milestone review asks "is the world/progression/leaderboard still
  the point?"
- **Privacy regression.** Mitigation: the structural no-content guarantee (§4) + CI
  check (§8).

## 11. Definition of done (Architect)

- Contracts (§4) published as engine types and frozen.
- Module graph (§5) scaffolded with the inward-dependency rule enforced.
- CI guardrails (§8) green on an empty repo.
- Open-decision register (§9) live and assigned.
- Build-vs-buy (§6) ratified after the Research spike.

## 12. First three tasks

1. Scaffold the monorepo and write the contract types into `packages/engine`.
2. Stand up the four CI guardrails against the empty scaffold.
3. Run (with Research) the D2 backend spike and ratify build-vs-buy.
