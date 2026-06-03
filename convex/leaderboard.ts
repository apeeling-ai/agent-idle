/**
 * Leaderboard query. Applies engine.decay per candidate so dead pets drop / grey out.
 *
 * STUB ranking — a flat global sort by TrainerScore. TODO:
 *  - Scopes: language / team / friends.
 *  - Weekly resets so newcomers can win (season vs lifetime).
 *  - Open tier (fun) vs Verified tier (means something).
 *  - Only `visibility === "public"` accounts should appear once visibility ships.
 */

import { isAlive, score, toTrainerStats } from "@agent-idle/engine";
import { query } from "./_generated/server";
import { rowToEntity } from "./lib/entity";

export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const accounts = await ctx.db.query("accounts").collect();

    const rows = [];
    for (const account of accounts) {
      const entityRow = await ctx.db
        .query("entities")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .first();
      const alive = entityRow ? isAlive(rowToEntity(entityRow), now) : false;
      rows.push({
        githubLogin: account.githubLogin,
        verified: account.verified,
        score: score(toTrainerStats(account.seasonStats)),
        alive, // dead pets are greyed out / dropped in the UI
      });
    }

    rows.sort((a, b) => b.score - a.score);
    return rows;
  },
});
