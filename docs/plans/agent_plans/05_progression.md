# Agent 05 — User Progression

> Greenfield. Owns the numbers: the Trainer Score, the stat definitions, the armor
> ladder, the unlock rules, and balancing. **Open decision D1 (failure state)** affects
> streak handling — see §7.

---

## 1. Mandate

Make growth feel earned and *visible*. Define what's tracked, how it scores, and what
it unlocks — so that climbing feels fair, good habits beat brute volume, and status
reads at a glance on the creature and the board.

## 2. Tracked stats

Derived server-side from the ledger; never client-authored.
- `tokensFed` — cumulative real usage volume.
- `linesAuthored` — lines Claude wrote for you (the deliberate vanity flex).
- `avgPromptQuality` — rolling average of appraised prompt quality.
- `survivalStreakDays` — consecutive days the creature stayed alive/fed.
- `zoneAchievements` — Path B accomplishments (mine hauls, campaigns, boss kills).

Two scopes: `lifetimeStats` (never reset, permanent prestige) and `seasonStats`
(reset each season for fresh competition).

## 3. The Trainer Score

```
TrainerScore = w1·tokensFed + w2·linesAuthored + w3·avgPromptQuality
             + w4·survivalStreakDays + w5·zoneAchievements
```

- Weights live in **one config file** so a whole season re-tunes without code.
- The **quality and streak terms** are what stop the board being "who generated the
  most slop" — a thoughtful light user should be able to beat a spammy heavy one. This
  is a testable balance target (§8), not a vibe.
- **Lines-of-code is intentionally a joke flex.** Everyone knows LOC is a garbage
  productivity metric; that's the satirical point. It's the loud number on the card;
  the real ranking leans on quality + streak + achievements.

## 4. The armor ladder

| Tier | Unlock (lines authored / tokens fed) | Look |
|---|---|---|
| Cloth | start | plain |
| Bronze | 1k / 100k | light trim |
| Iron | 10k / 1M | full plate |
| Steel | 50k / 10M | etched plate + cape |
| Mythril | 250k / 100M | glowing trim |
| Context Lord | 1M / 1B | full set + animated aura |

Thresholds are starting points and live in the same tunable config. Either stat path
can unlock a tier (whichever you hit first), so heavy users and long-haul users both
progress.

## 5. Non-grind cosmetics (so it's not only volume)

- **Streak crowns** — kept the creature alive N days straight.
- **Zone trophies** (Path B) — beat The Algorithm in the Mine; survive a PPTemple
  union arc with no strike.
- **Seasonal exclusives** — obtainable only in one season; proof you were there.

## 6. Cosmetic-first, not power-first (a values rule)

Gear is **visible respect, never a stat advantage.** If armor made the creature
stronger, the board would reward "who idled hardest," and the whole credibility
argument collapses. Hold this line; it's a design value, not a balance knob.

## 7. Failure state interaction (D1)

- Under **faint-recover**, a streak pauses on faint and resumes on feed (forgiving).
- Under **permanent death**, death resets `survivalStreakDays` to 0 and may reset the
  creature's earned-this-life cosmetics (lifetime prestige cosmetics could persist —
  a sub-decision to make when D1 lands).
- Progression must define streak/reset semantics for *both* modes now, so flipping D1
  is a config change, not a redesign.

## 8. Balancing method

- Build a **simulation harness** (uses the pure engine) that runs synthetic player
  profiles — "thoughtful light", "spammy heavy", "consistent daily", "weekend
  bursts" — and checks the score ordering matches intent (thoughtful-light should not
  finish last).
- Tune weights against those targets before launch; re-tune per season via config.
- Watch for degenerate strategies (e.g. trivial prompts farmed for volume) and blunt
  them with the quality term.

## 9. Interfaces & handoffs

- **Provides to Engine:** the scoring weights config + the unlock rule table (Engine
  implements the math; the server validates equips).
- **Provides to Frontend:** what to render per tier + the non-grind cosmetics.
- **Provides to Leaderboards:** the score definition they rank by.
- **Consumes:** the tracked stats from Networking's ingested ledger.

## 10. Risks

- **Volume-farming** the board → quality term + rate sanity (with Leaderboards).
- **Power creep** if anyone proposes stat-bearing gear → refuse per §6.
- **Unreachable top tiers** demotivate → tune thresholds with the sim harness; seasons
  give attainable short-term goals.
- **Streak anxiety** under permanent death → part of the D1 tone discussion.

## 11. Open decisions surfaced

- **D1** streak/reset semantics (defined for both modes now).
- **D5** season length + exactly which stats reset.
- Whether lifetime prestige cosmetics survive a permanent death (sub-decision of D1).

## 12. Definition of done

Scoring config + unlock table shipped and validated by the sim harness; both
failure-mode streak semantics implemented; crossing a threshold reliably grants the
right gear server-side; the board ranks a thoughtful light user above a spammy heavy
one in simulation.

## 13. First three tasks

1. Write the scoring config + unlock table as data the engine consumes.
2. Build the simulation harness with the four synthetic profiles.
3. Tune weights/thresholds until the ordering targets pass; document the knobs.
