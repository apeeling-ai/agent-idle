# Agent 09 — Social Media & Content

> Greenfield. Runs in parallel from day one, off the technical critical path. For a
> screenshot-driven toy, this is half the product. This is the content owner's primary
> lane (and includes the light, social-facing client surfaces).

---

## 1. Mandate

Make it spread, and give it a voice. Own the launch narrative, the demo asset, the
share-card creative, the worldbuilding writing, and the community seeding — so that
the day the build is ready, the growth motion is already loaded.

## 2. The growth thesis

Promptmon spreads on **recognition humor + earned-status flex**. Developers see
themselves in a creature fed by their real work and dressed by their real output, and
they post it. Two artifacts carry almost all of the spread: the **demo clip** and the
**share card**. Everything else supports those two.

## 3. The #1 asset: the demo clip

The "what is that on your second monitor?" video/gif of the creature reacting to live
Claude Code use. It must exist the instant Ship 1 works.
- 5–15 seconds, loopable, no narration needed.
- Show the causal beat clearly: *prompt in Claude Code → creature eats.* That single
  legible cause-and-effect is the hook.
- Capture multiple takes (different moods, an armor unlock) for a small library.

## 4. The viral loop: the share card (creative ownership)

Front End builds the renderer; Social owns the *creative*:
- What it shows (creature + armor + rank), the layout, the brand mark, the caption
  conventions.
- Make it look great **small** — it lives in timelines and previews.
- Define the templates: "I hit Iron", "rank #N this week", "my guy survived 30 days".
- Spec it early with Front End so it can render real data the moment Leaderboards ship.

## 5. The voice (worldbuilding bible)

Recognition humor is the differentiator; write it with teeth. Own:
- Creature/species names and their bios.
- Armor flavor text per tier.
- NPC personalities — the burned-out PPTemple monks, Old Man PageRank, the fictional
  leaderboard legends ("The Archmage of Autocomplete").
- Mood lines (with UX), season themes, error/empty-state copy.

The satire is the soul; keep it sharp, never mean-spirited, and never punching down.

## 6. Honest positioning

Lean into the real story rather than hiding it: *Anthropic shipped a terminal pet,
pulled it, the community revived it — we built the **world** around the idea, with a
leaderboard and earned armor.* Honesty about lineage is itself a credibility signal in
dev culture.

Pair this with the leaderboard's honest Open/Verified framing — the audience rewards
candor about what's real.

## 7. Channels & seeding

Dev-native, in rough launch order:
- **Show HN** (Hacker News) — the demo clip + the honest story.
- **X/Twitter** — the clip, then a steady drip of share cards.
- **Reddit** — relevant programming/AI-tooling subs (respect each sub's rules).
- **Dev Discords** — where this kind of thing actually circulates.
- **Product Hunt** — a structured launch day.
- **itch.io** — a home for the build + a community.
Seed the leaderboard with the fictional legend ghosts so it's never an empty room on
day one.

## 8. The light client surfaces (also this lane)

Off the critical path, vibe-codeable:
- **Landing page** — the demo clip, one-line pitch, waitlist, the honest story.
- **Share-card polish** — visual tuning of the export.
- Basic analytics for the funnel (privacy-respecting; counts, not content).

## 9. Cadence

- **Pre-launch:** build the bible, the landing page + waitlist, and tease the demo
  clip.
- **Launch week:** Show HN → Product Hunt → the channels, all anchored on the clip.
- **Post-launch:** a steady share-card drip; season announcements as re-engagement
  beats; spotlight real verified players who opt in (the genuine "great engineer on
  the board" moment).

## 10. Interfaces & handoffs

- **Consumes:** a working demo (Ship 1), Front End's share card, Leaderboards' rank
  data, the worldbuilding needs from UX/Progression.
- **Produces:** demo clip, landing page + copy, the worldbuilding bible, the seeding
  plan, the share-card creative, the launch calendar.
- **Feeds:** Strategy (the growth funnel + the success metric).

## 11. Risks

- **Launching before the clip exists** → no anchor asset; gate launch on Ship 1.
- **Empty-board launch** → NPC ghosts + friends/weekly scopes (with Leaderboards).
- **Over-polished, soulless copy** → the bible exists to keep the satire alive.
- **Channel-rule violations** (spammy posting) → respect each community's norms;
  one bad launch post can sour a whole subreddit.

## 12. Open decisions surfaced

- **D3** name/brand clearance (blocks the landing page going public).
- Whether to gate launch behind mobile or ship desktop-first (with Strategy).

## 13. Definition of done

The bible, landing page + waitlist, demo clip, share-card creative, and a channel-by-
channel launch calendar all exist *before* the leaderboard ships — so launch is a
button, not a scramble.

## 14. First three tasks

1. Draft the worldbuilding bible (names, NPCs, voice) — usable by every other agent.
2. Spec the share-card creative with Front End.
3. Build the landing page + waitlist (pending D3 name clearance) and storyboard the
   demo clip.
