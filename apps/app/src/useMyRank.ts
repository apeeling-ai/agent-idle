/**
 * The caller's leaderboard rank, POLLED with one-shot queries — deliberately NOT useQuery.
 *
 * `stats.getMyRank` reads the leaderboard aggregates, whose namespace-wide nodes are written
 * by every player's ingest. A reactive subscription would therefore refetch for every online
 * client on every event from anyone (N clients × M events/day — the classic Convex bill
 * killer). Rank moving a minute late is invisible in the UI; the quadratic refetch isn't.
 */

import { useConvex } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "./convex";

const POLL_MS = 90_000;

export interface MyRank {
  dailyRank: { rank: number; total: number } | null;
  seasonRank: { rank: number; total: number } | null;
}

export function useMyRank(enabled: boolean): MyRank | null {
  const convex = useConvex();
  const [rank, setRank] = useState<MyRank | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRank(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const r = await convex.query(api.stats.getMyRank, {});
        if (alive && r) setRank({ dailyRank: r.dailyRank, seasonRank: r.seasonRank });
      } catch {
        /* transient network/auth error — keep the last known rank until the next tick */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [convex, enabled]);

  return rank;
}
