# Security policy

Agent Idle installs a hook into your coding agent and runs a long-lived local daemon, so we
take security reports seriously.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through one of:

- GitHub's **[Report a vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)**
  feature (Security tab → Report a vulnerability), or
- email **security@apeelingai.com**.

Please include: a description of the issue, steps to reproduce, the affected component
(engine / CLI daemon / app / Convex backend), and the impact you foresee.

We aim to acknowledge reports within **3 business days** and to provide a remediation timeline
after triage. We'll credit you in the advisory unless you'd prefer to remain anonymous.

## Scope

In scope:

- The CLI daemon and its loopback HTTP server (`apps/cli/`).
- The coding-agent hook and event/outbox pipeline.
- Auth token handling and storage (`~/.agent-idle/auth.json`).
- The Convex backend functions (`convex/`) and any path that could store or leak prompt/code text.

Particularly interested in: anything that lets a local or remote process exfiltrate prompt or
source-code content (which the design guarantees never leaves the machine — see
[`PRIVACY.md`](PRIVACY.md)), bypass the loopback/CSRF protections, or read the auth token.

## Supported versions

This project is pre-1.0; only the latest `main` is supported. Please reproduce against `main`
before reporting.
