/**
 * @agent-idle/engine — pure, headless reducer.
 *
 * No DOM, no Node, no fetch (enforced by scripts/check-engine-purity.mjs). Imported
 * identically by the Convex authority, the CLI daemon, and the app.
 */

export * from "./config.js";
export * from "./resources.js";
export * from "./entities.js";
export * from "./decay.js";
export * from "./prompt.js";
export * from "./scoring.js";
export * from "./unlocks.js";
export * from "./events.js";
