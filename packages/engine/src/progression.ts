/**
 * Player progression — pure derivation of the account avatar's armor/level from lifetime
 * tokens. No DOM, no Node, no randomness; same math on the Convex authority, CLI and app.
 *
 * The idle-game contract: lifetime `tokensFed` only ever rises, and the avatar must keep
 * visibly progressing FOREVER despite a finite sprite set. We reconcile that by deriving an
 * unbounded per-slot tier and expressing it three ways at once (all from PROGRESSION config):
 *
 *   tier   = floor(log(tokens / unlockAt) / log(growth))   // unbounded, the real progress
 *   rung   = tier % rungs.length                           // index into the finite art ramp
 *   cycle  = floor(tier / rungs.length)                    // prestige recolor each ramp loop
 *
 * `rung` chooses the cosmetic sprite (finite); `cycle` recolors it (the renderer tints by
 * cycle); `level` + `glow` add an unbounded badge + continuous effect on top. Together a
 * player at 10× the tokens of another reads as visibly further along at every magnitude.
 */

import { PROGRESSION } from "./config.js";

/** One gear slot's derived state. `tier` is unbounded; `cosmetic` is the equipped id (e.g.
 * "armor.steel") the compositor routes to a layer, or null while the slot is still locked. */
export interface SlotProgress {
  /** "armor" | "helm" | "aura" — independent token curves. */
  slot: string;
  /** Unbounded tier index. -1 = locked (below the slot's unlock threshold). */
  tier: number;
  unlocked: boolean;
  /** Equipped cosmetic id ("<prefix><rung>") or null when locked. */
  cosmetic: string | null;
  /** The rung NAME at this tier (e.g. "steel"), or null when locked. For menu labels. */
  rungName: string | null;
  /** The rung NAME at the NEXT tier — what the player is grinding toward. When locked, this is
   * the first rung (what unlocking grants). Drives the menu's "up next" gear preview. */
  nextRungName: string;
  /** Index into the slot's finite ramp (which sprite). -1 when locked. */
  rung: number;
  /** How many times the ramp has looped — the renderer's prestige recolor. 0 on first ramp. */
  cycle: number;
  /** Lifetime tokens at which this slot reaches its NEXT tier (unlock when locked). Drives the
   * menu's "X to next" copy and per-slot progress bar. */
  nextAt: number;
  /** 0..1 progress through the current tier band toward `nextAt`. Locked: progress to unlock. */
  progress: number;
}

export interface PlayerProgress {
  /** Unbounded prestige badge from lifetime tokens. The headline "you are Level N". */
  level: number;
  /** 0..1 progress toward the next level — drives a progress bar. */
  progress: number;
  /** 0..∞ continuous signal (log of tokens). Drives aura size + a slight body scale; never caps. */
  glow: number;
  /** Per-slot derived state (armor/helm/aura), independent curves. */
  slots: SlotProgress[];
  /** The equipped cosmetic ids, ready to drop into a CreatureView. Locked slots omitted. */
  equipped: string[];
}

type SlotConfig = (typeof PROGRESSION.slots)[number];

/** Unbounded tier for one slot. -1 until the slot unlocks, then floor-log of the token ratio. */
function slotTier(tokensFed: number, slot: SlotConfig): number {
  if (tokensFed < slot.unlockAt) return -1;
  return Math.floor(Math.log(tokensFed / slot.unlockAt) / Math.log(slot.growth));
}

function deriveSlot(tokensFed: number, slot: SlotConfig): SlotProgress {
  const tier = slotTier(tokensFed, slot);
  if (tier < 0) {
    // Locked: the bar fills toward the unlock threshold; unlocking grants the first rung.
    return {
      slot: slot.slot,
      tier: -1,
      unlocked: false,
      cosmetic: null,
      rungName: null,
      nextRungName: slot.rungs[0]!,
      rung: -1,
      cycle: 0,
      nextAt: slot.unlockAt,
      progress: Math.min(1, tokensFed / slot.unlockAt),
    };
  }
  const rung = tier % slot.rungs.length;
  const rungName = slot.rungs[rung]!; // rung is always in range (tier % length)
  const nextRungName = slot.rungs[(tier + 1) % slot.rungs.length]!; // the upcoming tier's art
  const cycle = Math.floor(tier / slot.rungs.length);
  // Token band for this tier: [unlockAt·growth^tier, unlockAt·growth^(tier+1)).
  const bandStart = slot.unlockAt * slot.growth ** tier;
  const nextAt = slot.unlockAt * slot.growth ** (tier + 1);
  const progress = Math.min(1, Math.max(0, (tokensFed - bandStart) / (nextAt - bandStart)));
  return {
    slot: slot.slot,
    tier,
    unlocked: true,
    cosmetic: `${slot.prefix}${rungName}`,
    rungName,
    nextRungName,
    rung,
    cycle,
    nextAt,
    progress,
  };
}

/**
 * Derive the whole player progression from lifetime tokens. Pure and total — 0 tokens yields
 * level 0, no glow, all slots locked. Monotonic: more tokens never lowers any output.
 */
export function playerProgress(tokensFed: number, cfg = PROGRESSION): PlayerProgress {
  const tokens = Math.max(0, tokensFed);
  const slots = cfg.slots.map((s) => deriveSlot(tokens, s));

  // Continuous, unbounded level. log(1 + ratio) so 0 tokens → 0 cleanly (no -∞).
  const levelRaw = Math.log(1 + tokens / cfg.level.base) / Math.log(cfg.level.growth);
  const level = Math.max(0, Math.floor(levelRaw));
  const progress = levelRaw - Math.floor(levelRaw); // fractional part → 0..1 to next level

  const glow = Math.log(1 + tokens / cfg.glow.base) / Math.log(cfg.glow.growth);

  const equipped = slots
    .map((s) => s.cosmetic)
    .filter((id): id is string => id !== null);

  return { level, progress, glow, slots, equipped };
}

/** One rung in a slot's finite art ramp, for the gear gallery + equip UI. */
export interface RungInfo {
  /** Index into the slot's ramp. */
  rung: number;
  rungName: string;
  /** Cosmetic id the renderer routes to a layer ("<prefix><rung>"). */
  cosmetic: string;
  /** The player has reached this rung's tier, so it can be equipped. */
  unlocked: boolean;
  /** Lifetime tokens to FIRST reach this rung (its tier on the opening ramp). */
  unlockAt: number;
}

/** A slot's whole ladder + where the player currently is — the gear gallery's per-slot row. */
export interface SlotGallery {
  slot: string;
  /** The slot itself is unlocked (the player owns at least its first rung). */
  unlocked: boolean;
  /** Unbounded tier (-1 locked). */
  tier: number;
  /** The auto-equipped (highest) rung index, -1 when locked. */
  currentRung: number;
  /** Prestige loops completed (0 on the first ramp). */
  cycle: number;
  rungs: RungInfo[];
}

/** Every slot's full rung ladder with unlock flags — drives the gear gallery and equip screen. */
export function playerGallery(tokensFed: number, cfg = PROGRESSION): SlotGallery[] {
  const tokens = Math.max(0, tokensFed);
  return cfg.slots.map((slot) => {
    const tier = slotTier(tokens, slot);
    const rungs: RungInfo[] = slot.rungs.map((rungName, r) => ({
      rung: r,
      rungName,
      cosmetic: `${slot.prefix}${rungName}`,
      unlocked: tier >= r,
      unlockAt: slot.unlockAt * slot.growth ** r,
    }));
    return {
      slot: slot.slot,
      unlocked: tier >= 0,
      tier,
      currentRung: tier < 0 ? -1 : tier % slot.rungs.length,
      cycle: tier < 0 ? 0 : Math.floor(tier / slot.rungs.length),
      rungs,
    };
  });
}

/** Whether the player may equip a given rung in a slot — i.e. they've reached its tier. */
export function canEquip(
  tokensFed: number,
  slotName: string,
  rungName: string,
  cfg = PROGRESSION,
): boolean {
  const slot = cfg.slots.find((s) => s.slot === slotName);
  if (!slot) return false;
  const r = (slot.rungs as readonly string[]).indexOf(rungName);
  if (r < 0) return false;
  return slotTier(Math.max(0, tokensFed), slot) >= r;
}

/** A saved per-slot loadout override: slot name → chosen rung name (absent = use auto). */
export type Loadout = Partial<Record<string, string>>;

/**
 * The cosmetic ids to actually render: the auto-progression PER SLOT, except a slot with a
 * VALID (unlocked) saved override shows that rung instead. Locked slots render nothing. Pure —
 * the same resolution runs on the authority (validation) and the app (render).
 */
export function resolveEquipped(
  tokensFed: number,
  loadout: Loadout | null | undefined,
  cfg = PROGRESSION,
): string[] {
  const tokens = Math.max(0, tokensFed);
  const out: string[] = [];
  for (const slot of cfg.slots) {
    const tier = slotTier(tokens, slot);
    if (tier < 0) continue; // locked slot → nothing to show
    const override = loadout?.[slot.slot];
    const rungName =
      override && canEquip(tokens, slot.slot, override, cfg)
        ? override
        : slot.rungs[tier % slot.rungs.length]!;
    out.push(`${slot.prefix}${rungName}`);
  }
  return out;
}
