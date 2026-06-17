/**
 * Convex component registration. The aggregate component maintains an ordered, O(log n) index
 * over dailyStats so the daily leaderboard can compute an account's EXACT rank (and the total
 * player count) without scanning — the one thing the by_day_score index can't do for an account
 * outside the fetched top page. See lib/leaderboard.ts for the instance.
 */
import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config.js";

const app = defineApp();
app.use(aggregate, { name: "dailyLeaderboard" });
// A second, independent aggregate over seasonStats — same role as dailyLeaderboard but for the
// 2-week season board (exact rank + player count per season namespace).
app.use(aggregate, { name: "seasonLeaderboard" });
export default app;
