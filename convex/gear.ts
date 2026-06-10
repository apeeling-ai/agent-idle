/**
 * Player gear loadout — the ONE place a client choice ("wear this rung") is persisted. The
 * avatar normally auto-wears the highest unlocked rung per slot (engine.playerProgress); this
 * stores a per-slot override. The server is the only writer and re-validates the choice against
 * the account's lifetime tokens (engine.canEquip), so a client can never equip an unreached
 * tier. Identity-scoped via Convex Auth.
 */

import { canEquip } from "@agent-idle/engine";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { currentAccount } from "./lib/auth";

const SLOTS = ["armor", "weapon", "helm", "aura"] as const;
type SlotName = (typeof SLOTS)[number];

/** Equip a rung in a slot (or pass rung:null to clear the override → back to auto-highest). */
export const setLoadout = mutation({
  args: { slot: v.string(), rung: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const account = await currentAccount(ctx);
    if (!account) throw new Error("Not authenticated");
    if (!SLOTS.includes(args.slot as SlotName)) throw new Error(`Unknown slot: ${args.slot}`);
    const slot = args.slot as SlotName;

    // Lifetime tokens from the complete dailyStats rollup (per-account → never loses dead pets).
    const rows = await ctx.db
      .query("dailyStats")
      .withIndex("by_account_day", (q) => q.eq("accountId", account._id))
      .take(400);
    const tokens = rows.reduce((s, r) => s + r.tokensFed, 0);

    if (args.rung !== null && !canEquip(tokens, slot, args.rung)) {
      throw new Error(`Rung not unlocked: ${slot}.${args.rung}`);
    }

    const next: Partial<Record<SlotName, string>> = { ...account.loadout };
    if (args.rung === null) delete next[slot];
    else next[slot] = args.rung;
    await ctx.db.patch(account._id, { loadout: next });
    return { ok: true };
  },
});
