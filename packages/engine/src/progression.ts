/**
 * Player progression — pure derivation of the account avatar's gear economy from lifetime
 * tokens + a tiny persisted INVENTORY. No DOM, no Node, no randomness; the same math runs on
 * the Convex authority, the CLI and the app.
 *
 * The model: lifetime `tokensFed` mints a spendable currency (coins); the player SPENDS coins to
 * climb each slot's Maple-style tier ladder, in order. The only persisted state is, per slot,
 * how many tiers have been BOUGHT (`owned`) plus an optional worn-rank override (`equipped`) —
 * everything else (balance, worn art, prestige recolor) derives from those + the token total:
 *
 *   tier    = owned - 1                                       // highest tier purchased
 *   rank    = floor(tier / subtiersPerRung)                   // Maple-style visual rank band
 *   subtier = subtiersPerRung - (tier % subtiersPerRung)      // T4→T1 inside the rank
 *   rung    = rank % rungs.length                             // index into the finite art ramp
 *   cycle   = floor(rank / rungs.length)                      // prestige recolor each ramp loop
 *
 * Balance can never desync because it is `coinsEarned(tokens) − costOfEverythingOwned(inv)` — a
 * pure function of the token total and the owned counters; there is no second ledger. The server
 * is still the only writer: a purchase mutation validates affordability with `canBuyTier`, then
 * increments `owned`. Buying is in-order (a single counter), permanent, and idempotent (the buy
 * names the tier it expects to be next, so a double-click is a no-op).
 */

import { PROGRESSION } from "./config.js";

type SlotConfig = (typeof PROGRESSION.slots)[number];

/**
 * The whole economy's persisted state (server-authoritative). Tiny: a per-slot purchase counter
 * and a per-slot worn-rank override. Absent slot ⇒ owned 0 / auto-equip.
 */
export interface Inventory {
  /** Tiers BOUGHT per slot — you own tiers 0..owned-1, so the highest owned tier is owned-1.
   * Absent or 0 ⇒ the slot has nothing yet. */
  owned: Partial<Record<string, number>>;
  /** Worn RANK override per slot (which rung+cycle to display). Absent ⇒ auto-wear the highest
   * owned rank. Must be a reached rank (validated on write). */
  equipped: Partial<Record<string, number>>;
}

/** An empty inventory — the starting state for a fresh (or just-migrated) account. */
export const EMPTY_INVENTORY: Inventory = { owned: {}, equipped: {} };

function findSlot(slotName: string, cfg = PROGRESSION): SlotConfig | undefined {
  return cfg.slots.find((s) => s.slot === slotName);
}

function ownedOf(inv: Inventory, slotName: string): number {
  return Math.max(0, Math.floor(inv.owned?.[slotName] ?? 0));
}

/** Owned tiers CLAMPED to the slot's finite max. The ladder ends at Ancient T1, so a stored count
 * larger than that (e.g. left over from an earlier, cheaper price curve) is treated as fully
 * maxed — it never derives phantom ranks past Ancient (which would render as duplicate cells). */
function ownedTiers(inv: Inventory, slot: SlotConfig): number {
  return Math.min(ownedOf(inv, slot.slot), maxTiers(slot));
}

// ---------------------------------------------------------------------------------------------
// Currency — coins minted from lifetime tokens, spent down by what's owned.
// ---------------------------------------------------------------------------------------------

/** Coins minted by lifetime tokens. Pure, monotonic, floored to whole coins. */
export function coinsEarned(tokensFed: number, cfg = PROGRESSION): number {
  return Math.floor(Math.max(0, tokensFed) * cfg.currency.earnRate);
}

/** Coin price of buying TIER `tier` in a slot (the `tier`-th purchase, 0-indexed). Rounded to
 * whole coins so the wallet stays exact integer arithmetic. Pure. */
export function tierCost(slot: SlotConfig, tier: number): number {
  return Math.round(slot.baseCost * slot.costGrowth ** Math.max(0, tier));
}

/** Coins already sunk into owning `owned` tiers (tiers 0..owned-1) — the exact running sum of
 * each tier's rounded price, so `balance` and the per-tier `tierCost` stay bit-consistent (a buy
 * lowers the balance by exactly the price shown). `owned` stays small even at astronomical token
 * counts — the cost curve caps it around ~130 — so the sum is cheap. Pure. */
export function totalCost(slot: SlotConfig, owned: number): number {
  const n = Math.max(0, Math.floor(owned));
  let sum = 0;
  for (let t = 0; t < n; t++) sum += tierCost(slot, t);
  return sum;
}

/** Total coins spent across every slot in the inventory. Pure. */
export function spentTotal(inv: Inventory, cfg = PROGRESSION): number {
  return cfg.slots.reduce((sum, slot) => sum + totalCost(slot, ownedOf(inv, slot.slot)), 0);
}

export interface Wallet {
  /** Coins minted by lifetime tokens. */
  earned: number;
  /** Coins sunk into owned gear. */
  spent: number;
  /** Spendable coins right now (earned − spent). */
  balance: number;
}

/** The player's wallet: earned (from tokens) − spent (from owned gear). Pure. */
export function wallet(tokensFed: number, inv: Inventory, cfg = PROGRESSION): Wallet {
  const earned = coinsEarned(tokensFed, cfg);
  const spent = spentTotal(inv, cfg);
  return { earned, spent, balance: earned - spent };
}

// ---------------------------------------------------------------------------------------------
// Tier derivation — the Maple-style rank / sub-tier / rung / cycle math, by tier index.
// ---------------------------------------------------------------------------------------------

/** Prestige recolor for a cycle (0 ⇒ no tint). Pure. */
export function cycleTint(cycle: number, cfg = PROGRESSION): number {
  const tints = cfg.cycleTints;
  return tints[((cycle % tints.length) + tints.length) % tints.length] ?? 0xffffff;
}

/** Everything derivable from a slot + a tier index — the Maple ladder math in one place. */
export interface TierInfo {
  /** The tier index (≥ 0). */
  tier: number;
  /** Visual rank band = floor(tier / subtiersPerRung). */
  rank: number;
  /** T(maxSubtier)→T1 sub-tier inside the rank band (T1 = last step before the next rung). */
  subtier: number;
  /** Sub-tiers per rank band (from config). */
  maxSubtier: number;
  /** Index into the slot's finite art ramp. CLAMPS at the final rung — it never cycles back to
   * the first rung, so the rarity reads "Ancient" forever once the top art is reached. */
  rung: number;
  /** Prestige loops past the FINAL rung = max(0, rank − lastRung). 0 until the top art; then each
   * further rank band adds a ★ (a recolor of the Ancient art), so progress never visually resets. */
  cycle: number;
  /** The rung NAME at this tier (e.g. "plate"). */
  rungName: string;
  /** This is the slot's final (top) rung — the "Ancient" rarity that the climb caps at. */
  isAncient: boolean;
  /** Cosmetic id the compositor routes to a layer ("<prefix><rungName>"). */
  cosmetic: string;
  /** Prestige recolor tint for this cycle (0xffffff on the first reach of each rung). */
  tint: number;
}

function deriveTier(slot: SlotConfig, tier: number): TierInfo {
  const sub = slot.subtiersPerRung;
  const t = Math.max(0, Math.floor(tier));
  const rank = Math.floor(t / sub);
  const subtier = sub - (t % sub);
  const lastRung = slot.rungs.length - 1;
  const rung = Math.min(rank, lastRung); // clamp the art at the top — never wraps to rung 0
  const cycle = Math.max(0, rank - lastRung); // prestige ★ accrues ONLY past the final rung
  const rungName = slot.rungs[rung]!;
  return {
    tier: t,
    rank,
    subtier,
    maxSubtier: sub,
    rung,
    cycle,
    rungName,
    isAncient: rung === lastRung,
    cosmetic: `${slot.prefix}${rungName}`,
    tint: cycleTint(cycle),
  };
}

/** The highest owned tier's full info for a slot, or null when the slot owns nothing. Pure. */
export function topTier(inv: Inventory, slotName: string, cfg = PROGRESSION): TierInfo | null {
  const slot = findSlot(slotName, cfg);
  if (!slot) return null;
  const owned = ownedOf(inv, slotName);
  if (owned <= 0) return null;
  return deriveTier(slot, owned - 1);
}

// ---------------------------------------------------------------------------------------------
// Equip resolution — what the avatar actually wears (override or auto-highest).
// ---------------------------------------------------------------------------------------------

/** One worn gear piece, ready to hand to the renderer (cosmetic id + its prestige recolor). */
export interface EquippedPiece {
  slot: string;
  cosmetic: string;
  cycle: number;
  tint: number;
}

/** The valid worn RANK for a slot: a reached override if any, else the highest owned rank.
 * Returns -1 when the slot owns nothing. Pure. */
function wornRank(inv: Inventory, slot: SlotConfig): number {
  const owned = ownedOf(inv, slot.slot);
  if (owned <= 0) return -1;
  const topRank = Math.floor((owned - 1) / slot.subtiersPerRung);
  const override = inv.equipped?.[slot.slot];
  if (override != null && override >= 0 && override <= topRank) return Math.floor(override);
  return topRank;
}

/**
 * The pieces the avatar actually renders: per slot, the worn rank's art (override where chosen
 * and reached, else the highest owned rank). Slots that own nothing render nothing. Pure — the
 * same resolution runs on the authority (validation) and the app (render).
 */
export function resolveEquipped(inv: Inventory, cfg = PROGRESSION): EquippedPiece[] {
  const out: EquippedPiece[] = [];
  for (const slot of cfg.slots) {
    const rank = wornRank(inv, slot);
    if (rank < 0) continue;
    const info = deriveTier(slot, rank * slot.subtiersPerRung);
    out.push({ slot: slot.slot, cosmetic: info.cosmetic, cycle: info.cycle, tint: info.tint });
  }
  return out;
}

/** Flatten worn pieces to bare cosmetic ids (the compositor's `equipped: string[]`). Pure. */
export function equippedIds(pieces: EquippedPiece[]): string[] {
  return pieces.map((p) => p.cosmetic);
}

/** Worn pieces → cosmetic-id → prestige tint map (the renderer's per-layer recolor). Pure. */
export function equippedTints(pieces: EquippedPiece[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pieces) out[p.cosmetic] = p.tint;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Validation — the two things the server writes (buy a tier, equip a rank).
// ---------------------------------------------------------------------------------------------

/**
 * Whether the player may BUY the next tier in a slot. `expectedNext` MUST equal the slot's
 * current owned count (the index of the tier being bought) — this makes the purchase idempotent
 * (a stale/duplicate buy with the wrong index is rejected) and the affordability check exact.
 */
export function canBuyTier(
  tokensFed: number,
  inv: Inventory,
  slotName: string,
  expectedNext: number,
  cfg = PROGRESSION,
): boolean {
  const slot = findSlot(slotName, cfg);
  if (!slot) return false;
  const owned = ownedOf(inv, slotName);
  if (owned >= maxTiers(slot)) return false; // MAXED — the slot is finite and ends at Ancient T1
  if (expectedNext !== owned) return false; // stale view / duplicate click
  return wallet(tokensFed, inv, cfg).balance >= tierCost(slot, owned);
}

/** Whether `rank` is a reached, wearable rank for a slot (the bound on an equip override). Pure. */
export function canEquipRank(inv: Inventory, slotName: string, rank: number, cfg = PROGRESSION): boolean {
  const slot = findSlot(slotName, cfg);
  if (!slot) return false;
  const owned = ownedOf(inv, slotName);
  if (owned <= 0) return false;
  const topRank = Math.floor((owned - 1) / slot.subtiersPerRung);
  return Number.isInteger(rank) && rank >= 0 && rank <= topRank;
}

// ---------------------------------------------------------------------------------------------
// Shop view — everything the character-sheet / shop UI needs, per slot.
// ---------------------------------------------------------------------------------------------

/** The next tier the player can buy in a slot. Null once the slot is MAXED (Ancient T1 owned —
 * the climb is finite and ends at Ancient; there is no prestige past it). */
export interface NextTier {
  info: TierInfo;
  /** Coin price of this purchase. */
  cost: number;
  /** The wallet can afford it right now. */
  affordable: boolean;
  /** Coins still needed (0 when affordable). */
  shortfall: number;
  /** This purchase swaps the art (crosses a rung boundary / the first purchase). */
  rankUp: boolean;
}

/** Total purchasable tiers in a slot — every rung × its sub-tiers. Owning this many = MAXED. */
export function maxTiers(slot: SlotConfig): number {
  return slot.rungs.length * slot.subtiersPerRung;
}

/** A reached rank the player can equip — one cell in the wear-picker. */
export interface OwnedRank {
  rank: number;
  info: TierInfo;
  /** This rank is the one currently worn. */
  worn: boolean;
}

/** One slot's full state for the shop/character sheet. */
export interface SlotShop {
  slot: string;
  /** Tiers bought (0 ⇒ nothing yet). */
  owned: number;
  /** owned > 0. */
  unlocked: boolean;
  /** The highest owned tier's info (the top of the climb), or null when owned is 0. Carries the
   * live sub-tier pips (T4→T1) for the worn-at-top display. */
  top: TierInfo | null;
  /** The rank currently worn (override or top rank); -1 when nothing owned. */
  wornRank: number;
  /** A valid, reached equip override is in effect (so the worn rank may be below the top). When
   * false the slot auto-wears its highest owned rank. */
  hasOverride: boolean;
  /** The slot is fully upgraded — Ancient T1 owned, nothing left to buy. */
  maxed: boolean;
  /** The next purchasable tier (cost, affordability, art swap), or null when MAXED. */
  next: NextTier | null;
  /** Every reached rank, for the wear-picker. Empty when nothing owned. */
  ranks: OwnedRank[];
}

function deriveSlotShop(slot: SlotConfig, inv: Inventory, balance: number): SlotShop {
  const owned = ownedOf(inv, slot.slot);
  const top = owned > 0 ? deriveTier(slot, owned - 1) : null;
  const worn = wornRank(inv, slot);
  const hasOverride = top !== null && worn >= 0 && worn !== top.rank;

  const max = maxTiers(slot);
  const maxed = owned >= max;
  let next: NextTier | null = null;
  if (!maxed) {
    const nextInfo = deriveTier(slot, owned); // the owned-th tier is the next purchase
    const cost = tierCost(slot, owned);
    // rankUp = the buy SWAPS the art (rung changes) — the first piece, or crossing a rung boundary.
    const rankUp = top === null ? true : nextInfo.rung > top.rung;
    next = { info: nextInfo, cost, affordable: balance >= cost, shortfall: Math.max(0, cost - balance), rankUp };
  }

  const ranks: OwnedRank[] =
    top === null
      ? []
      : Array.from({ length: top.rank + 1 }, (_, r) => ({
          rank: r,
          info: deriveTier(slot, r * slot.subtiersPerRung),
          worn: r === worn,
        }));

  return {
    slot: slot.slot,
    owned,
    unlocked: owned > 0,
    top,
    wornRank: worn,
    hasOverride,
    maxed,
    next,
    ranks,
  };
}

/** The unbounded prestige LEVEL badge from lifetime tokens (token-derived flavor; not spent). */
export interface PlayerLevel {
  /** 0..∞ level badge ("you are Level N"). */
  level: number;
  /** 0..1 progress toward the next level — drives a progress bar. */
  progress: number;
}

/** Derive the lifetime-token LEVEL badge. Pure; 0 tokens → level 0 cleanly. */
export function playerLevel(tokensFed: number, cfg = PROGRESSION): PlayerLevel {
  const tokens = Math.max(0, tokensFed);
  const raw = Math.log(1 + tokens / cfg.level.base) / Math.log(cfg.level.growth);
  const level = Math.max(0, Math.floor(raw));
  return { level, progress: raw - Math.floor(raw) };
}

/** The whole player shop view: the shared wallet, the level badge, and every slot's state. */
export interface PlayerShop {
  wallet: Wallet;
  level: PlayerLevel;
  slots: SlotShop[];
}

/**
 * Derive the entire player shop from lifetime tokens + the persisted inventory. Pure and total —
 * 0 tokens + empty inventory yields level 0, a 0 balance, and every slot owning nothing.
 */
export function playerShop(tokensFed: number, inv: Inventory, cfg = PROGRESSION): PlayerShop {
  const w = wallet(tokensFed, inv, cfg);
  return {
    wallet: w,
    level: playerLevel(tokensFed, cfg),
    slots: cfg.slots.map((slot) => deriveSlotShop(slot, inv, w.balance)),
  };
}
