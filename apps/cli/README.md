# @agent-idle/cli

The Agent Idle sensor CLI: it watches your coding agent (Claude Code / Codex),
appraises prompts **locally**, and reports only numeric token counts + a quality
score — never prompt text or source code.

## Install

```bash
npx @agent-idle/cli setup      # one-time setup (installs the agent hook)
```

Or globally:

```bash
npm i -g @agent-idle/cli
agent-idle setup
```

## Commands

```bash
agent-idle setup [claude] [codex]   # install the hook + start the daemon
agent-idle status                   # show the local daemon / session state
agent-idle remove                   # sign out everywhere + remove the hook
agent-idle kill                     # stop the local daemon
```

## Privacy

Prompts are appraised on your machine. Only a numeric quality score and token
counts ever leave it — there is no prompt-text or source-code field anywhere in
the wire format.

## License

AGPL-3.0-only
