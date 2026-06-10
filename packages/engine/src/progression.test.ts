import { describe, expect, it } from "vitest";
import {
  EMPTY_INVENTORY,
  type Inventory,
  PROGRESSION,
  canBuyTier,
  canEquipRank,
  coinsEarned,
  equippedIds,
  maxTiers,
  playerLevel,
  playerShop,
  resolveEquipped,
  spentTotal,
  tierCost,
  totalCost,
  wallet,
} from "./index.js";

const cfg = (name: string) => PROGRESSION.slots.find((s) => s.slot === name)!;
const armorCfg = cfg("armor");
const SUB = armorCfg.subtiersPerRung;

/** A bare inventory with `owned` tiers in one slot (+ optional equip overrides). */
const inv = (owned: Partial<Record<string, number>> = {}, equipped: Partial<Record<string, number>> = {}): Inventory => ({
  owned,
  equipped,
});

const shopSlot = (s: ReturnType<typeof playerShop>, name: string) => s.slots.find((x) => x.slot === name)!;

describe("coinsEarned / wallet", () => {
  it("mints coins from tokens at the configured rate, floored, clamped at 0", () => {
    expect(coinsEarned(0)).toBe(0);
    expect(coinsEarned(-500)).toBe(0);
    expect(coinsEarned(12_345)).toBe(Math.floor(12_345 * PROGRESSION.currency.earnRate));
  });

  it("is monotonic — more tokens never lowers earned coins", () => {
    let prev = -1;
    for (const t of [0, 1_000, 50_000, 1e6, 1e9, 1e18]) {
      const c = coinsEarned(t);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("balance = earned − spent, and an empty inventory spends nothing", () => {
    expect(spentTotal(EMPTY_INVENTORY)).toBe(0);
    const w = wallet(1_000_000, EMPTY_INVENTORY);
    expect(w.spent).toBe(0);
    expect(w.balance).toBe(w.earned);
    expect(w.earned).toBe(coinsEarned(1_000_000));
  });
});

describe("tier pricing", () => {
  it("each tier costs costGrowth× the previous (escalating, unbounded)", () => {
    expect(tierCost(armorCfg, 0)).toBeCloseTo(armorCfg.baseCost);
    expect(tierCost(armorCfg, 1)).toBeCloseTo(armorCfg.baseCost * armorCfg.costGrowth);
    expect(tierCost(armorCfg, 5)).toBeGreaterThan(tierCost(armorCfg, 4));
  });

  it("totalCost is the geometric sum of every owned tier's price", () => {
    expect(totalCost(armorCfg, 0)).toBe(0);
    expect(totalCost(armorCfg, 1)).toBeCloseTo(tierCost(armorCfg, 0));
    const byHand = [0, 1, 2, 3].reduce((s, t) => s + tierCost(armorCfg, t), 0);
    expect(totalCost(armorCfg, 4)).toBeCloseTo(byHand);
  });

  it("spentTotal sums every slot's sunk cost", () => {
    const i = inv({ armor: 3, weapon: 2 });
    expect(spentTotal(i)).toBeCloseTo(totalCost(armorCfg, 3) + totalCost(cfg("weapon"), 2));
  });
});

describe("playerShop — the Maple ladder, paid in coins", () => {
  it("zero tokens + empty inventory: level 0, 0 balance, every slot owns nothing", () => {
    const s = playerShop(0, EMPTY_INVENTORY);
    expect(s.level.level).toBe(0);
    expect(s.wallet.balance).toBe(0);
    expect(s.slots.every((x) => x.owned === 0 && !x.unlocked && x.top === null && x.wornRank === -1)).toBe(true);
    expect(resolveEquipped(EMPTY_INVENTORY)).toEqual([]);
  });

  it("the first purchase is affordable exactly at its baseCost and grants the first rung", () => {
    const s = playerShop(armorCfg.baseCost, EMPTY_INVENTORY);
    const armor = shopSlot(s, "armor");
    expect(armor.next.cost).toBeCloseTo(armorCfg.baseCost);
    expect(armor.next.affordable).toBe(true);
    expect(armor.next.info).toMatchObject({ tier: 0, rung: 0, cycle: 0, subtier: SUB, rungName: armorCfg.rungs[0] });
    expect(armor.next.rankUp).toBe(true);
    // One token shy → cannot afford, shortfall is exactly 1.
    const shy = shopSlot(playerShop(armorCfg.baseCost - 1, EMPTY_INVENTORY), "armor");
    expect(shy.next.affordable).toBe(false);
    expect(shy.next.shortfall).toBe(1);
  });

  it("owning tiers derives rank / sub-tier / rung / cycle and the worn art", () => {
    // owned = SUB+1 → highest tier = SUB → rank 1 (leather), sub-tier T4.
    const armor = shopSlot(playerShop(1e12, inv({ armor: SUB + 1 })), "armor");
    expect(armor.owned).toBe(SUB + 1);
    expect(armor.top).toMatchObject({ tier: SUB, rank: 1, rung: 1, subtier: SUB, cosmetic: `armor.${armorCfg.rungs[1]}` });
    expect(armor.wornRank).toBe(1);
    expect(equippedIds(resolveEquipped(inv({ armor: SUB + 1 })))).toContain(`armor.${armorCfg.rungs[1]}`);
  });

  it("steps T4→T1 within a rung before the next purchase swaps the art", () => {
    // owned = 2 → top tier 1 → still rung 0, sub-tier T(SUB-1); the next buy (tier 2) does NOT rank up.
    const armor = shopSlot(playerShop(1e12, inv({ armor: 2 })), "armor");
    expect(armor.top).toMatchObject({ tier: 1, rung: 0, subtier: SUB - 1 });
    expect(armor.next.info.tier).toBe(2);
    expect(armor.next.rankUp).toBe(false);
    // owned = SUB → next buy is tier SUB → rank 1 → an art swap.
    const atRungEdge = shopSlot(playerShop(1e12, inv({ armor: SUB })), "armor");
    expect(atRungEdge.next.rankUp).toBe(true);
  });

  it("the ladder is FINITE — owning every tier maxes the slot at Ancient (no next, no cycle)", () => {
    const lastRung = armorCfg.rungs.length - 1;
    const max = armorCfg.rungs.length * SUB; // every rung × every sub-tier
    expect(max).toBe(maxTiers(armorCfg));
    // owned = max → Ancient T1, slot maxed, nothing left to buy.
    const armor = shopSlot(playerShop(1e18, inv({ armor: max })), "armor");
    expect(armor.maxed).toBe(true);
    expect(armor.next).toBeNull();
    expect(armor.top).toMatchObject({ rung: lastRung, cycle: 0, subtier: 1, isAncient: true });
    expect(armor.top!.rungName).toBe(armorCfg.rungs[lastRung]); // top art, never "cloth"
    // One short of max → the last buy IS available, and it's Ancient (no art swap, no prestige).
    const almost = shopSlot(playerShop(1e18, inv({ armor: max - 1 })), "armor");
    expect(almost.maxed).toBe(false);
    expect(almost.next!.info).toMatchObject({ rung: lastRung, cycle: 0, isAncient: true });
    expect(almost.next!.rankUp).toBe(false);
  });

  it("a maxed slot rejects further purchases", () => {
    const max = maxTiers(armorCfg);
    expect(canBuyTier(1e18, inv({ armor: max }), "armor", max)).toBe(false);
  });

  it("clamps a stale over-large owned count — no duplicate ranks, spend bounded to the max", () => {
    const max = maxTiers(armorCfg);
    const stale = inv({ armor: max * 4 }); // e.g. left over from an earlier, cheaper price curve
    const armor = shopSlot(playerShop(1e18, stale), "armor");
    // The wardrobe lists exactly the distinct rungs (Rare…Ancient), not phantom Ancient copies.
    expect(armor.ranks.length).toBe(armorCfg.rungs.length);
    expect(armor.maxed).toBe(true);
    // Spend is the cost of fully maxing the slot, NOT the astronomical raw count.
    expect(spentTotal(stale)).toBeCloseTo(totalCost(armorCfg, max));
  });

  it("reaching Ancient's last sub-tier costs on the order of a billion coins", () => {
    const lastTier = maxTiers(armorCfg) - 1; // Ancient T1, the final purchase
    const cost = tierCost(armorCfg, lastTier);
    expect(cost).toBeGreaterThan(1e8); // hundreds of millions+ — a real endgame sink
    expect(cost).toBeLessThan(1e11); // ...but billions, not trillions
  });
});

describe("canBuyTier — affordability + idempotent in-order purchase", () => {
  it("allows the next tier when affordable and the expected index matches", () => {
    const i = inv({ armor: 2 });
    const cost = tierCost(armorCfg, 2);
    expect(canBuyTier(cost + totalCost(armorCfg, 2), i, "armor", 2)).toBe(true);
  });

  it("rejects an unaffordable buy", () => {
    const i = inv({ armor: 2 });
    // Just under (cost of tier 2 + what's already sunk into tiers 0..1).
    const justUnder = totalCost(armorCfg, 2) + tierCost(armorCfg, 2) - 1;
    expect(canBuyTier(justUnder, i, "armor", 2)).toBe(false);
  });

  it("rejects a stale/duplicate index (not the current owned count)", () => {
    const i = inv({ armor: 2 });
    expect(canBuyTier(1e18, i, "armor", 1)).toBe(false); // already bought
    expect(canBuyTier(1e18, i, "armor", 3)).toBe(false); // skipping ahead
  });

  it("rejects an unknown slot", () => {
    expect(canBuyTier(1e18, EMPTY_INVENTORY, "nope", 0)).toBe(false);
  });
});

describe("canEquipRank / resolveEquipped overrides", () => {
  const owned = inv({ armor: 2 * SUB + 1 }); // top tier 2*SUB → rank 2 (chain) reached

  it("allows reached ranks, rejects future ones and empty slots", () => {
    expect(canEquipRank(owned, "armor", 0)).toBe(true);
    expect(canEquipRank(owned, "armor", 2)).toBe(true);
    expect(canEquipRank(owned, "armor", 3)).toBe(false); // not reached
    expect(canEquipRank(EMPTY_INVENTORY, "armor", 0)).toBe(false);
    expect(canEquipRank(owned, "nope", 0)).toBe(false);
  });

  it("auto-wears the highest owned rank with no override", () => {
    expect(equippedIds(resolveEquipped(owned))).toContain(`armor.${armorCfg.rungs[2]}`);
  });

  it("a valid override wears that rank instead", () => {
    const i = inv({ armor: 2 * SUB + 1 }, { armor: 0 }); // downgrade to the first rung
    const ids = equippedIds(resolveEquipped(i));
    expect(ids).toContain(`armor.${armorCfg.rungs[0]}`);
    expect(ids.some((id) => id.startsWith("armor.") && id !== `armor.${armorCfg.rungs[0]}`)).toBe(false);
  });

  it("an out-of-range override is ignored (falls back to auto-highest)", () => {
    const i = inv({ armor: 2 * SUB + 1 }, { armor: 9 }); // rank 9 not reached
    expect(equippedIds(resolveEquipped(i))).toContain(`armor.${armorCfg.rungs[2]}`);
  });
});

describe("playerLevel — unbounded token-derived badge", () => {
  it("rises with tokens, progress stays in 0..1, never caps", () => {
    const a = playerLevel(1e6);
    const b = playerLevel(1e9);
    expect(b.level).toBeGreaterThan(a.level);
    for (const p of [a, b, playerLevel(1e21)]) {
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThan(1);
      expect(Number.isFinite(p.level)).toBe(true);
    }
  });
});
