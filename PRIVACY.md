# Privacy & data flow

Agent Idle installs a hook into your coding agent and runs a small local daemon. Because that
daemon can see your activity, here is exactly what it does and does not do with your data. Every
claim below is verifiable in the source — file references are included so you can check.

## TL;DR

- **Your prompts and source code never leave your machine.** Prompts are scored *locally*; only
  a single numeric quality value (0–1) and counts are ever sent.
- **There is no prompt-text or source-code column anywhere in the backend schema.** The server
  *cannot* store your text even by mistake — it's a structural guarantee, not just a policy.
- **The daemon is loopback-only** (`127.0.0.1`), with DNS-rebinding and CSRF defenses.
- **No third-party analytics or telemetry.** The only outbound network destination is your own
  Convex deployment.

## What leaves your machine

When you use your coding agent, the daemon emits events to the backend containing **only**:

- token counts (integers),
- a coarse prompt-quality score in `[0, 1]`,
- prompt/event counts,
- enum categories for activity (e.g. `shell` / `edit` / `read` / `web`) and status,
- timing in milliseconds per activity category,
- your session id and an idempotency key.

That's it. The payload is numbers and enums. See the durable outbox in
`apps/cli/src/outbox.ts` and the server-side sanitizer in `convex/events.ts`.

## What is read locally but never sent

These touch your content on your machine but the content itself is discarded immediately and
never transmitted:

- **Prompt text** is read only by `appraisePrompt()` (`packages/engine/src/prompt.ts`) to
  compute the numeric quality score, using simple linguistic heuristics — no ML, no external call.
- **The transcript file** is read only to sum numeric token `usage` fields
  (`apps/cli/src/transcript.ts`); message content is never extracted.
- **A one-word topic** may be inferred from your first prompt to label the session in the local
  app UI (served over loopback). It is never sent to the backend.
- **Permission/notification text** is classified locally into an enum (`alert` / `question`);
  the text is discarded.
- **The agent process id** is polled locally to detect crashes; it is never reported.

## Why you can trust the structural claim

`convex/schema.ts` declares no `prompt`, `message`, `code`, `content`, `input`, or `output`
text column anywhere. The ledger payload is validated server-side and coerced to numbers
(`convex/events.ts`). Even a malicious client cannot persist prompt text, because there is
nowhere to put it.

## Local security

- The daemon binds to `127.0.0.1` only (`apps/cli/src/daemon.ts`), rejects non-loopback hosts
  (DNS-rebinding defense), and refuses cross-site browser callers on state-changing endpoints.
- Your auth token is stored at `~/.agent-idle/auth.json` with `0600` permissions (owner
  read/write only) in a `0700` directory (`apps/cli/src/config.ts`), and is never exposed to web pages.

## Reporting a privacy or security concern

See [`SECURITY.md`](SECURITY.md).
