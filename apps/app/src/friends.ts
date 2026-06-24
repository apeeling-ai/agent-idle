/**
 * The friends subscriptions + mutations, bundled into one object the shells hand to <Dashboard>
 * (which stays backend-agnostic — it only sees the `DashboardFriends` data + callbacks, never
 * Convex). Mirrors the useWorld seam: each shell calls this once and passes the result down.
 *
 * `active` gates the heavier reads to when the Stats/Friends surface is open, exactly like the
 * leaderboard queries — at rest the ambient view never subscribes.
 */

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "./convex";
import type { AddFriendResult, DashboardFriends, FriendsLeaderboard, FriendsOverview } from "./dashboard/types";

export type FriendsApi = DashboardFriends;

export function useFriends({ active }: { active: boolean }): FriendsApi {
  const { isAuthenticated } = useConvexAuth();
  const on = isAuthenticated && active;

  const overview = useQuery(api.friends.getFriendsOverview, on ? {} : "skip") as
    | FriendsOverview
    | undefined;
  const leaderboard = useQuery(api.friends.getFriendsLeaderboard, on ? {} : "skip") as
    | FriendsLeaderboard
    | undefined;
  // The caller's current global visibility, for the leaderboard's public/private toggle. Same
  // query the shells already subscribe to (Convex dedupes identical subscriptions, so it's free).
  const playerState = useQuery(api.events.getPlayerState, on ? {} : "skip") as
    | { account?: { visibility?: "public" | "private" } }
    | undefined;

  const sendRequest = useMutation(api.friends.sendFriendRequest);
  const accept = useMutation(api.friends.acceptFriendRequest);
  const decline = useMutation(api.friends.declineFriendRequest);
  const cancel = useMutation(api.friends.cancelFriendRequest);
  const remove = useMutation(api.friends.removeFriend);
  const setVisibility = useMutation(api.friends.setVisibility);

  return {
    overview,
    leaderboard,
    visibility: playerState?.account?.visibility,
    onSetVisibility: (visibility) => void setVisibility({ visibility }).catch(() => {}),
    onAdd: (username: string): Promise<AddFriendResult> =>
      sendRequest({ username }).catch(
        (): AddFriendResult => ({ ok: false, error: "Something went wrong. Try again." }),
      ) as Promise<AddFriendResult>,
    onAccept: (requestId) => void accept({ requestId: requestId as never }).catch(() => {}),
    onDecline: (requestId) => void decline({ requestId: requestId as never }).catch(() => {}),
    onCancel: (requestId) => void cancel({ requestId: requestId as never }).catch(() => {}),
    onRemove: (accountId) => void remove({ friendAccountId: accountId as never }).catch(() => {}),
  };
}
