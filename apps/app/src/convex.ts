/**
 * Convex client + generated API. The app subscribes to the authoritative reactive
 * state here; it is NOT a sync layer (we use Convex's official React bindings).
 *
 * The `api` is the root-level generated client (convex/ lives at the repo root per the
 * project layout). VITE_CONVEX_URL comes from the repo `.env.local` written by
 * `convex dev`.
 */

import { ConvexReactClient } from "convex/react";

// Root-level generated API (repo `convex/`), re-exported for app code.
export { api } from "../../../convex/_generated/api";

const url = (import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "http://127.0.0.1:3210";

/** The deployment URL this client talks to. Exported so the device-connect flow can seed
 *  ConvexAuthProvider's per-address-namespaced storage keys to the exact same value. */
export const convexUrl = url;

export const convex = new ConvexReactClient(url);
