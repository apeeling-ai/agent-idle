/**
 * Product analytics (PostHog), web-only. Initialized exclusively in production browser
 * builds — never in dev, and never inside the Tauri desktop/mobile shells, so the
 * installed app and the local daemon keep making zero third-party requests
 * (see PRIVACY.md). Nothing in the web bundle ever sees prompt text or source code,
 * so nothing here can leak it.
 *
 * The key is the project's *publishable* client token (it ships in every browser
 * bundle by design); override key/host per-deployment with VITE_POSTHOG_KEY /
 * VITE_POSTHOG_HOST.
 */

import posthog from "posthog-js";
import { isTauri } from "./platform";

const DEFAULT_KEY = "phc_pvF34mqwPJ9C88rk7Bs4c3a4FGweVnFq9njSUr6dfH39";
const DEFAULT_HOST = "https://eu.i.posthog.com";

export function initAnalytics(): void {
  if (!import.meta.env.PROD || isTauri()) return;
  const key = (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ?? DEFAULT_KEY;
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? DEFAULT_HOST,
    ui_host: "https://eu.posthog.com",
    defaults: "2025-05-24",
    // Anonymous events only until/unless we ever call identify() explicitly.
    person_profiles: "identified_only",
  });
}
