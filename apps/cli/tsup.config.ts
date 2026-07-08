import { defineConfig } from "tsup";

// Prod endpoints baked into the published bundle (the npm channel only ships
// from prod tags — see .github/workflows/release.yml). Overridable via env for
// one-off builds against another deployment.
const BUILD_CONVEX_URL =
  process.env.AGENT_IDLE_BUILD_CONVEX_URL ?? "https://handsome-camel-783.convex.cloud";
const BUILD_AUTH_URL = process.env.AGENT_IDLE_BUILD_AUTH_URL ?? "https://agent-idle-app.vercel.app";

// Produces a single self-contained CLI bundle for npm publishing.
// The workspace-only engine is INLINED (noExternal) so the published
// package carries no `workspace:*` dependency; real registry deps stay
// external and are declared by scripts/make-cli-package.mjs.
export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "dist-npm",
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  clean: true,
  sourcemap: false,
  splitting: false,
  shims: false,
  // Inline the workspace engine (its shebang-free ESM output).
  noExternal: ["@agent-idle/engine"],
  // Keep published-registry deps external — npm installs them normally.
  external: ["convex", "@clack/prompts"],
  // Inline the prod defaults consumed in src/config.ts.
  env: {
    AGENT_IDLE_BUILD_CONVEX_URL: BUILD_CONVEX_URL,
    AGENT_IDLE_BUILD_AUTH_URL: BUILD_AUTH_URL,
  },
});
