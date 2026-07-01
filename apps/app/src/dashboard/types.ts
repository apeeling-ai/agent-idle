/**
 * Prop shapes for the dashboard, mirroring what the convex/stats.ts queries return.
 * Kept local (not imported from the generated API) so the dashboard stays a window- and
 * backend-agnostic component tree — the same render/-is-extractable philosophy.
 */

export interface ActionMs {
  shell: number;
  edit: number;
  read: number;
  web: number;
  thinking: number;
  idle: number;
}

export interface Rollup {
  tokensFed: number;
  activeMs: number;
  actionMs: ActionMs;
  promptQualitySum: number;
  promptCount: number;
}

/** One day's headline numbers — the series the heatmap, trend bars, and records derive from. */
export interface DayPoint {
  utcDay: number;
  tokensFed: number;
  activeMs: number;
  actionMs: ActionMs;
  score: number;
}

/**
 * Canonical never-reset accumulation, summed from per-pet `entities.stats` by getPlayerState.
 * This is the TRUE lifetime total (tokens/lines/turns ever) — unlike the dailyStats rollup,
 * which only covers the days it has rows for. The Overview's "Lifetime" figures use this so
 * they never appear to reset or under-report.
 */
export interface LifetimeTotals {
  tokensFed: number;
  activeMs: number;
  promptCount: number;
}

export interface StatsOverview {
  today: Rollup | null;
  season: Rollup;
  lifetime: Rollup;
  todayScore: number;
  seasonScore: number;
  lifetimeScore: number;
  /** The caller's live standing on each board (exact, global), for the always-visible chip. */
  dailyRank: { rank: number; total: number } | null;
  seasonRank: { rank: number; total: number } | null;
  streak: number;
  longestStreak: number;
  bestDay: { utcDay: number; score: number } | null;
  daysActive: number;
  days: DayPoint[];
  utcDay: number;
  /** The current 2-week season index (engine.seasonIndexOf). */
  season_index: number;
}

/** One of the account's pets (Claude Code sessions), for the all-time hall of fame. */
export interface PetStat {
  name: string;
  species: string;
  tokensFed: number;
  promptCount: number;
  promptQualitySum: number;
  actionMs: ActionMs;
  status: string;
  alive: boolean;
  activity: string;
  bornAt: number;
  lastUpdated: number;
}

export interface LeaderboardEntry {
  name: string;
  tokens: number;
  isYou: boolean;
}

/** One past season's podium for the season-history view. */
export interface SeasonHistoryEntry {
  /** Raw season index (storage key). */
  season: number;
  /** Human-facing season number ("Season N"). */
  number: number;
  /** The season's themed trophy. */
  reward: { kind: string; glyph: string; label: string };
  /** Top-3 public finishers, best first. */
  top: { name: string; tokens: number; isYou: boolean; rank: number }[];
}

/** One accepted friend (for the management list). `accountId` is the Convex id, passed back to
 * `removeFriend`. */
export interface FriendSummary {
  accountId: string;
  name: string;
}

/** A pending friend request, in either direction. `requestId` is the friendEdge id. */
export interface FriendRequest {
  requestId: string;
  name: string;
}

/** Everything the Friends tab renders — mirrors convex/friends.ts:getFriendsOverview. */
export interface FriendsOverview {
  myUsername: string | null;
  friends: FriendSummary[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** The friends-only leaderboard, both scopes — same shape as the public boards so <Leaderboard>
 * renders it unchanged. Mirrors convex/friends.ts:getFriendsLeaderboard. */
export interface FriendsLeaderboard {
  today: LeaderboardData;
  season: LeaderboardData;
}

/** The result of a sendFriendRequest call (mirrors the mutation's return). */
export interface AddFriendResult {
  ok: boolean;
  error?: string;
  status?: "requested" | "accepted" | "pending" | "already_friends";
}

/** Data + callbacks the Friends tab and the leaderboard's Friends filter need. Injected by the
 * shells (which own the Convex subscriptions) so the dashboard tree stays backend-agnostic — the
 * same seam as render/. `undefined` data = still loading. */
export interface DashboardFriends {
  overview: FriendsOverview | undefined;
  leaderboard: FriendsLeaderboard | undefined;
  onAdd: (username: string) => Promise<AddFriendResult>;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onRemove: (accountId: string) => void;
  /** The caller's GLOBAL leaderboard visibility (account-level, from getPlayerState). Surfaced on
   * this bundle because it's the shell→dashboard conduit the Leaderboard already consumes.
   * `undefined` = still loading; the toggle hides until it resolves. */
  visibility?: "public" | "private";
  /** Flip the caller public/private on the global board (convex/friends.ts:setVisibility). */
  onSetVisibility?: (visibility: "public" | "private") => void;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  /** The caller's own standing in this window: exact global rank among `total` active players. */
  you: { tokens: number; rank: number; total: number } | null;
  /** Present on the daily board (its UTC-day bucket). */
  utcDay?: number;
  /** Present on the season board (its 2-week season index). */
  season?: number;
  /** Season board only: epoch ms when the current season ends (the countdown target). */
  seasonEndsAt?: number;
  /** Season board only: the themed trophy a podium (top-3) finish wins this season. */
  reward?: { kind: string; glyph: string; label: string };
}
