# Agent 06 — Leaderboards & Online Play

> Greenfield. The viral engine — and the place credibility is won or lost. Sits on top
> of Engine + Networking + Progression; built last of the core.

---

## 1. Mandate

Turn verified stats into boards people trust and want to climb. Make a great
engineer's high score *mean something*, make cheating not worth it, and make the
board feel alive even when small.

## 2. Foundational stance: server-authoritative

Ranks are computed by reducing the append-only event ledger — never from a
client-reported total. Every score is re-derivable and auditable. If a number can't
be reconstructed from the ledger, it doesn't go on the board.

## 3. Anti-cheat in honest tiers

1. **Signed events** — per-account HMAC; randoms can't POST to your account.
2. **Rate sanity** — server caps plausible ingestion (tokens/min, lines/min beyond
   human+Claude throughput). Bursts are rejected or flagged.
3. **Anomaly flags + shadow handling** — suspicious accounts are quietly held out of
   public boards pending review, not hard-banned (avoids false-positive blowback).
4. **The honest ceiling** — someone controlling their own machine can fake their own
   usage; no third party fully verifies Anthropic usage today. So split the board:
   - **Open tier** — anyone; fun; clearly labeled "mostly honest."
   - **Verified tier** — a checkmark via stronger proof (manual review for notable
     accounts now; signed first-party usage later *if* it ever exists). The one that
     means something.

State this split *in the UI*. Honesty about the limit is itself a credibility signal.

## 4. Board scopes (so it's not one intimidating wall)

- **Global**, **by language**, **by org/team**, **friends-only**.
- **Weekly** and **seasonal** boards (reset `seasonStats`) so a newcomer can win *this
  week* even if they'll never out-grind a veteran. This is what keeps a board alive
  past week two.

## 5. The hard queries (the real engineering)

- **Top-N** — easy.
- **Around-me** (your rank ± k) — needs efficient ranked indexing.
- **Time-windowed** (this week/season) — needs windowed aggregation.
These are exactly what purpose-built services do well; per Research D2, spike Postgres
ranked queries vs Nakama's leaderboard module before committing. Decision recorded
with the Architect.

## 6. Identity

GitHub OAuth; one board identity per GitHub account; display name + avatar from
GitHub (also the creature's "wears your identity" feature). One-account-per-identity
is an anti-cheat anchor.

## 7. Aspirational targets without faking people

- Seed **clearly-fictional legendary NPC ghosts** at the top ("The Archmage of
  Autocomplete", "Old Man PageRank"). Obvious flavor, impersonating no one, there to
  be dethroned.
- **Never** fabricate or display a real person's score without consent. The
  "see Karpathy at #1" dream is real *only* if Karpathy opts in — then a verified
  checkmark and his genuinely earned armor tell the story. That's a better story than
  a fake number; design for the opt-in path.

## 8. Privacy & consent

- `visibility` defaults to **private**; you appear on public boards only by choosing.
- Leaving a board **purges** your public row.
- No content ever surfaces — boards show stats, rank, name, avatar, and earned gear
  only.

## 9. Armor on the board

The same renderer compositor (Frontend) draws each board entry's avatar *with its
earned gear*. A Context Lord aura at the top of the global board is the entire flex —
it must render identically to the live creature. Never fork the compositor for the
board.

## 10. The share card feed

Leaderboards provide the rank + percentile data the share card renders (creature +
armor + rank). This is the viral loop's data source; treat the board API as a
first-class input to Social's share card.

## 11. Phased delivery

- Depends on Networking's verified stream (P4) and Progression's score (parallel).
- **P6:** boards (scopes + weekly/seasonal), opt-in visibility, rate-sanity + anomaly
  flags, Open/Verified tiers, NPC ghosts, armor on avatars, share-card feed.

## 12. Interfaces & handoffs

- **Consumes:** Networking's ingested verified events; Progression's score definition;
  Frontend's compositor.
- **Produces:** board APIs (top-N, around-me, scoped, seasonal), verification flow,
  anti-cheat pipeline, the share-card data feed.
- **Feeds:** Frontend (board screens) and Social (share card).

## 13. Risks

- **Spoofed scores erode trust** → server-authority + Verified tier + honest labeling.
- **False-positive bans** → shadow-hold + review, not hard-ban.
- **Empty-board syndrome at launch** → NPC ghosts + friends/weekly scopes.
- **Ranking-at-scale cost** → resolve via the D2 spike before hand-rolling.
- **Impersonation/privacy** → opt-in only, purge on leave, no fabricated entries.

## 14. Open decisions surfaced

- **D2** ranking layer (Postgres vs Nakama).
- Verification criteria for the Verified tier (what proof, who reviews).
- **D5** season length + reset cadence (with Progression).

## 15. Definition of done

You and a friend see each other ranked with gear showing; a spammer hammering the
endpoint gets capped/flagged instead of hitting #1; around-me and weekly queries are
fast; visibility is opt-in and purge-on-leave works; the share-card feed returns
correct rank/percentile.

## 16. First three tasks

1. Run the D2 ranking spike with Research; pick the ranking layer.
2. Build the ingest→rank pipeline over the verified ledger with rate-sanity caps.
3. Ship one scoped board end-to-end (global weekly) with armor-on-avatar rendering.
