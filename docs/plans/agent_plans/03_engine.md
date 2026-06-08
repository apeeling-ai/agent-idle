# Agent 03 — Engine

> Greenfield, pure TypeScript. **Open decision D1 (failure state)** lives here as a
> config flag `failureMode: "faint" | "death"` — the engine implements both paths and
> hard-codes neither.

---

## 1. Mandate

Build the deterministic, platform-pure heart of the game: entities, resources, the
passage of time, prompt-appraisal, and the shared math for scoring and unlocks. The
same code runs in the client (instant feedback) and on the server (authority) and
must agree to the byte.

## 2. Purity contract (non-negotiable #1)

No DOM, no Node APIs, no `fetch`, no `Date.now()` buried inside logic (time is passed
in). The engine is a pure function library over explicit state. CI fails the build on
any forbidden import. This is what makes the mobile app and the server-side authority
nearly free.

## 3. Core model

- **Entity** — anything alive (the pet first; subagents, monks later).
- **Resource** — any tracked number on an entity (hunger first; tokens, ore, burnout
  later). Resources have a per-species decay (or accrual) rate, a floor, and a cap.
- **Status** — a transient tag (`in_the_zone`, `confused`, `striking`, `fainted`).
- **Zone** — a place entities can be assigned (empty in Path A).

The pet is just the first entity; hunger just the first resource. Path B is *data*.

## 4. The functions (public API)

```
newEntity(id, species, name?) → Entity
tick(entity, now) → Entity            // applies decay/accrual since lastTick
apply(entity, event, now) → { entity, result }   // the universal input handler
appraisePrompt(text) → { fill, tier, status, qualityScore }
score(stats, weights) → number        // Trainer Score (shared with server)
unlocksFor(stats, rules) → string[]    // which cosmetics are earned
reduce(save, events[]) → save          // replay → authoritative state (server uses this)
```

`apply` dispatches on `event.type` and ignores `event.source` — that's why on-screen
taps and Claude Code hooks never conflict, and why a taps-only phone is a full
citizen.

## 5. Time & determinism

- Time is always an argument (`now`), never read internally. Tests inject time.
- `tick` computes elapsed hours from `lastTick` and applies `rate * hours` per
  resource, clamped to floor/cap.
- **Determinism law:** `reduce(save, events)` is pure and order-stable. Same inputs →
  byte-identical output. This is the foundation of server authority and the
  anti-cheat re-derivation. A CI test enforces it.

## 6. Prompt appraisal (the central joke, as math)

`appraisePrompt` grades food quality and a parallel `qualityScore` for scoring:
- empty → nothing.
- vibes-only ("make it pop", "just do the thing") → junk food, `confused` status, low
  quality.
- very short → stale crumbs, low fill.
- has context (because/so that/constraint) → balanced meal.
- has context **and** an example → gourmet, full fill, `in_the_zone`, top quality.

Tunable via a single table so balance changes don't touch logic. Lives in the engine
so client preview and server authority grade identically.

## 7. Scoring & unlocks (shared math, owned with Progression)

- `score()` implements the Trainer Score composite; **weights come from Progression's
  config**, not hard-coded here.
- `unlocksFor()` evaluates Progression's threshold rules against stats; the server
  calls it as the validator (you can't equip what the ledger didn't earn).
- The engine provides the math; Progression owns the numbers.

## 8. Failure state (D1) — built both ways

```
config.failureMode: "faint" | "death"
```
- `"faint"`: hunger 0 → `status = fainted`, `alive = true`; recovers on feeding.
- `"death"`: hunger 0 past a grace window → `alive = false`; a new creature must be
  hatched.

`tick`/`apply` branch on the flag. No other agent hard-codes the choice; flipping D1
later is a config change, not a refactor.

## 9. Resources roadmap (Path B readiness)

The resource system is generic so Path B is additive:
- `tokens` (currency, accrues from zones),
- `ore` (Gold Mine output),
- `burnout` (PPTemple — a resource that *rises* with work; thresholds → complaints →
  strike). Burnout is just a resource with an inverted rate and threshold statuses.

No engine rewrite is needed for any of these — they're new entries in the resource
and status tables.

## 10. Testing strategy

- **Unit:** each resource's decay/accrual, each prompt tier, each scoring term.
- **Property:** determinism (replay yields identical save); monotonic decay; clamping.
- **Golden fixture:** a canonical (save + event stream → final save) shared with the
  server's contract test (Architect §8).
- **Both failure modes** tested independently.
- **Done before any pixels exist** (tests-before-pixels rule).

## 11. Interfaces & handoffs

- **Consumes:** Architect's contract types; Progression's weights + unlock rules.
- **Produces:** the function API (§4) imported by Renderer (preview), Server
  (authority), Networking (event shape).
- **Hard dependency for:** literally everything; the engine is the first thing built.

## 12. Risks

- **Hidden impurity** (someone imports a Node util) → CI lint catches it.
- **Client/server divergence** → the shared golden fixture catches it.
- **Over-building Path B early** → keep zones stubbed until Path A ships.

## 13. Definition of done

Pure package, all tests green headless, determinism + both failure modes proven, the
golden fixture passing, scoring/unlock hooks wired to Progression's config. No UI.

## 14. First three tasks

1. Implement `Entity`/`Resource`/`tick`/`apply` with the purity lint on from commit 1.
2. Implement `appraisePrompt` + the prompt-tier table with full unit tests.
3. Implement `reduce` + the determinism property test + the golden fixture.
