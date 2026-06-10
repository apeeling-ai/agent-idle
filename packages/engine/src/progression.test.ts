import { describe, expect, it } from "vitest";
import { PROGRESSION, canEquip, playerGallery, playerProgress, resolveEquipped } from "./index.js";

const slot = (p: ReturnType<typeof playerProgress>, name: string) =>
  p.slots.find((s) => s.slot === name)!;

describe("playerProgress — locked slots", () => {
  it("zero tokens: level 0, no glow, every slot locked, nothing equipped", () => {
    const p = playerProgress(0);
    expect(p.level).toBe(0);
    expect(p.glow).toBe(0);
    expect(p.equipped).toEqual([]);
    expect(p.slots.every((s) => !s.unlocked && s.cosmetic === null && s.tier === -1)).toBe(true);
  });

  it("a slot stays locked below its unlock threshold", () => {
    const p = playerProgress(4_999); // armor unlocks at 5_000
    expect(slot(p, "armor").unlocked).toBe(false);
    expect(p.equipped).not.toContain("armor.cloth");
  });

  it("clamps negative tokens to the zero state", () => {
    expect(playerProgress(-100)).toEqual(playerProgress(0));
  });
});

describe("playerProgress — slot tiers from the token curve", () => {
  it("equips the first ramp rung exactly at the unlock threshold", () => {
    const p = playerProgress(5_000);
    const armor = slot(p, "armor");
    expect(armor).toMatchObject({ unlocked: true, tier: 0, rung: 0, cycle: 0, cosmetic: "armor.cloth" });
    expect(p.equipped).toContain("armor.cloth");
  });

  it("advances one rung per growth multiple of the unlock threshold", () => {
    // armor: unlockAt 5_000, growth 4 → tier 1 at 20_000, tier 2 at 80_000.
    expect(slot(playerProgress(20_000), "armor").tier).toBe(1);
    expect(slot(playerProgress(20_000), "armor").cosmetic).toBe("armor.leather");
    expect(slot(playerProgress(80_000), "armor").tier).toBe(2);
    expect(slot(playerProgress(79_999), "armor").tier).toBe(1); // just shy stays put
  });

  it("cycles the finite ramp and bumps the prestige cycle when it loops", () => {
    const armorCfg = PROGRESSION.slots.find((s) => s.slot === "armor")!;
    const len = armorCfg.rungs.length; // 5
    // tokens that land exactly on tier == len (first rung of the 2nd cycle).
    const tokens = armorCfg.unlockAt * armorCfg.growth ** len;
    const armor = slot(playerProgress(tokens), "armor");
    expect(armor.tier).toBe(len);
    expect(armor.rung).toBe(0); // wrapped back to the first rung
    expect(armor.cycle).toBe(1); // ...but on the second loop (prestige recolor)
    expect(armor.cosmetic).toBe(`armor.${armorCfg.rungs[0]}`);
  });

  it("slots unlock independently on their own curves", () => {
    const p = playerProgress(60_000); // armor & helm unlocked, aura (250k) not yet
    expect(slot(p, "armor").unlocked).toBe(true);
    expect(slot(p, "helm").unlocked).toBe(true);
    expect(slot(p, "aura").unlocked).toBe(false);
    expect(p.equipped).toEqual(expect.arrayContaining(["armor.leather", "helm.nasal"]));
    expect(p.equipped.some((id) => id.startsWith("aura."))).toBe(false);
  });
});

describe("playerProgress — unbounded level + continuous glow", () => {
  it("level rises with tokens and progress stays within 0..1", () => {
    const a = playerProgress(1_000_000);
    const b = playerProgress(1_000_000_000);
    expect(b.level).toBeGreaterThan(a.level);
    for (const p of [a, b]) {
      expect(p.progress).toBeGreaterThanOrEqual(0);
      expect(p.progress).toBeLessThan(1);
    }
  });

  it("is monotonic — more tokens never lowers level, glow, or any slot tier", () => {
    let prev = playerProgress(0);
    for (const t of [1_000, 5_000, 50_000, 250_000, 1e6, 1e7, 1e9, 1e12]) {
      const cur = playerProgress(t);
      expect(cur.level).toBeGreaterThanOrEqual(prev.level);
      expect(cur.glow).toBeGreaterThanOrEqual(prev.glow);
      for (const s of cur.slots) {
        expect(s.tier).toBeGreaterThanOrEqual(slot(prev, s.slot).tier);
      }
      prev = cur;
    }
  });

  it("never caps — even astronomical token counts stay finite and keep climbing", () => {
    const huge = playerProgress(1e18);
    const huger = playerProgress(1e21);
    expect(Number.isFinite(huge.glow)).toBe(true);
    expect(huger.level).toBeGreaterThan(huge.level);
    expect(slot(huger, "armor").cycle).toBeGreaterThan(slot(huge, "armor").cycle);
  });
});

describe("playerGallery — every rung with unlock flags", () => {
  const gslot = (tokens: number, name: string) =>
    playerGallery(tokens).find((s) => s.slot === name)!;

  it("locked slot: nothing unlocked, all rungs listed", () => {
    const armor = gslot(0, "armor"); // unlockAt 5k
    expect(armor.unlocked).toBe(false);
    expect(armor.currentRung).toBe(-1);
    expect(armor.rungs.every((r) => !r.unlocked)).toBe(true);
    expect(armor.rungs.map((r) => r.rungName)).toEqual(PROGRESSION.slots[0].rungs);
  });

  it("unlocks rungs up to the reached tier", () => {
    const armor = gslot(80_000, "armor"); // tier 2 (chain): rungs 0,1,2 unlocked, 3,4 locked
    expect(armor.tier).toBe(2);
    expect(armor.currentRung).toBe(2);
    expect(armor.rungs.map((r) => r.unlocked)).toEqual([true, true, true, false, false]);
  });

  it("after a full ramp loop, every rung is unlocked and prestige cycles", () => {
    const armor = gslot(6_000_000, "armor"); // tier 5 → looped past legion, cycle 1
    expect(armor.rungs.every((r) => r.unlocked)).toBe(true);
    expect(armor.cycle).toBeGreaterThanOrEqual(1);
  });
});

describe("canEquip — gate on reached tier", () => {
  it("allows reached rungs, rejects future ones", () => {
    expect(canEquip(80_000, "armor", "chain")).toBe(true); // tier 2 == chain
    expect(canEquip(80_000, "armor", "cloth")).toBe(true); // earlier rung
    expect(canEquip(80_000, "armor", "plate")).toBe(false); // tier 3, not yet
  });
  it("rejects unknown slot/rung", () => {
    expect(canEquip(1e9, "armor", "nonsense")).toBe(false);
    expect(canEquip(1e9, "nope", "cloth")).toBe(false);
  });
});

describe("resolveEquipped — auto with valid overrides", () => {
  it("with no loadout, matches the auto-equipped ids", () => {
    expect(resolveEquipped(80_000, null)).toEqual(playerProgress(80_000).equipped);
  });
  it("a valid override replaces just that slot", () => {
    const eq = resolveEquipped(80_000, { armor: "cloth" }); // downgrade armor to an earlier rung
    expect(eq).toContain("armor.cloth");
    expect(eq.some((id) => id.startsWith("armor.") && id !== "armor.cloth")).toBe(false);
  });
  it("an unlocked-but-future override is ignored (falls back to auto)", () => {
    const eq = resolveEquipped(80_000, { armor: "plate" }); // plate not reached → auto chain
    expect(eq).toContain("armor.chain");
  });
});
