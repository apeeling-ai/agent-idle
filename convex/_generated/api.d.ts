/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as gear from "../gear.js";
import type * as http from "../http.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_entity from "../lib/entity.js";
import type * as lib_rate from "../lib/rate.js";
import type * as lib_rollup from "../lib/rollup.js";
import type * as lib_spawn from "../lib/spawn.js";
import type * as maintenance from "../maintenance.js";
import type * as stats from "../stats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auth: typeof auth;
  crons: typeof crons;
  events: typeof events;
  gear: typeof gear;
  http: typeof http;
  leaderboard: typeof leaderboard;
  "lib/auth": typeof lib_auth;
  "lib/entity": typeof lib_entity;
  "lib/rate": typeof lib_rate;
  "lib/rollup": typeof lib_rollup;
  "lib/spawn": typeof lib_spawn;
  maintenance: typeof maintenance;
  stats: typeof stats;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
