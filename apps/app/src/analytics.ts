/**
 * Product analytics (PostHog), web-only. Initialized exclusively in production browser
 * builds — never in dev, and never inside the Tauri desktop/mobile shells, so the
 * installed app and the local daemon keep making zero third-party requests
 * (see PRIVACY.md). Nothing in the web bundle ever sees prompt text or source code,
 * so nothing here can leak it.
 *
 * Key/host come from VITE_POSTHOG_KEY / VITE_POSTHOG_HOST — defaults live in
 * `apps/app/.env.production` (a publishable client token, not a secret); env vars set
 * in the Vercel dashboard take precedence. No key → no init, so a deployment can opt
 * out (e.g. previews) by setting VITE_POSTHOG_KEY to empty.
 */

import posthog from "posthog-js";
import { isTauri } from "./platform";

export function initAnalytics(): void {
  if (!import.meta.env.PROD || isTauri()) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key) return;
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://eu.i.posthog.com",
    ui_host: "https://eu.posthog.com",
    defaults: "2025-05-24",
    // Anonymous events only until/unless we ever call identify() explicitly.
    person_profiles: "identified_only",
  });
}
