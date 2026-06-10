/**
 * Player gear economy — the ONE place client choices ("buy a tier", "wear this rank") are
 * persisted. The server is the only writer and re-validates every choice with the pure engine
 * against the account's lifetime tokens + current inventory, so a client can never buy what it
 * cannot afford nor equip a rank it has not reached. Balance is DERIVED (coins minted by tokens
 * minus the cost of everything owned), never stored — there is no second ledger to desync.
 * Identity-scoped via Convex Auth.
 */

import { type Inventory, canBuyTier, canEquipRank } from "@agent-idle/engine";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { currentAccount } from "./lib/auth";

const SLOTS = ["armor", "legs", "weapon", "helm", "aura"] as const;
type SlotName = (typeof SLOTS)[number];

/** Lifetime tokens from the complete dailyStats rollup (per-account → never loses dead pets). */
async function lifetimeTokens(ctx: MutationCtx, accountId: Id<"accounts">): Promise<number> {
  const rows = await ctx.db
    .query("dailyStats")
    .withIndex("by_account_day", (q) => q.eq("accountId", accountId))
    .take(400);
  return rows.reduce((s, r) => s + r.tokensFed, 0);
}

/** The persisted gear → a normalized engine Inventory (absent fields default to empty). */
function toInventory(gear: { owned?: Record<string, number | undefined>; equipped?: Record<string, number | undefined> } | undefined): Inventory {
  return { owned: { ...gear?.owned }, equipped: { ...gear?.equipped } };
}

/**
 * Buy the NEXT tier in a slot. `expectedNext` is the tier index the client believes is next (==
 * its current owned count); the engine rejects the buy unless it still matches, which makes a
 * double-click idempotent (the second arrives with a stale index and no-ops) and the affordability
 * check exact. On success the owned counter for the slot increments by one.
 */
export const buyGear = mutation({
  args: { slot: v.string(), expectedNext: v.number() },
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    if (!account) throw new Error("Not authenticated");
    if (!SLOTS.includes(args.slot as SlotName)) throw new Error(`Unknown slot: ${args.slot}`);
    const slot = args.slot as SlotName;

    const inv = toInventory(account.gear);
    const owned = Math.max(0, Math.floor(inv.owned[slot] ?? 0));
    // Idempotent no-op: this purchase already landed (the index is behind the counter).
    if (args.expectedNext < owned) return { ok: true, owned, alreadyBought: true };

    const tokens = await lifetimeTokens(ctx, account._id);
    if (!canBuyTier(tokens, inv, slot, args.expectedNext)) {
      throw new Error(`Cannot buy ${slot} tier ${args.expectedNext} (unaffordable or stale)`);
    }

    const nextOwned = { ...inv.owned, [slot]: owned + 1 };
    await ctx.db.patch(account._id, { gear: { owned: nextOwned, equipped: { ...inv.equipped } } });
    return { ok: true, owned: owned + 1, alreadyBought: false };
  },
});

/** Wipe the account's gear economy back to empty (owned + overrides). For re-tuning the price
 * curve pre-release: old owned tiers priced on a cheaper curve would otherwise compute a negative
 * balance. After a reset, balance = coins(lifetime tokens) again, ready to re-spend. */
export const resetGear = mutation({
  args: {},
  handler: async (ctx) => {
    const account = await currentAccount(ctx);
    if (!account) throw new Error("Not authenticated");
    await ctx.db.patch(account._id, { gear: { owned: {}, equipped: {} } });
    return { ok: true };
  },
});

/** Equip a reached RANK in a slot (or rank:null to clear → auto-wear the highest owned rank). */
export const setEquipped = mutation({
  args: { slot: v.string(), rank: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    if (!account) throw new Error("Not authenticated");
    if (!SLOTS.includes(args.slot as SlotName)) throw new Error(`Unknown slot: ${args.slot}`);
    const slot = args.slot as SlotName;

    const inv = toInventory(account.gear);
    if (args.rank !== null && !canEquipRank(inv, slot, args.rank)) {
      throw new Error(`Rank not reached: ${slot} rank ${args.rank}`);
    }

    const nextEquipped: Record<string, number | undefined> = { ...inv.equipped };
    if (args.rank === null) delete nextEquipped[slot];
    else nextEquipped[slot] = args.rank;
    await ctx.db.patch(account._id, { gear: { owned: { ...inv.owned }, equipped: nextEquipped } });
    return { ok: true };
  },
});
