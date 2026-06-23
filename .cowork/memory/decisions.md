# letta-cowork decisions

**Last updated:** 2026-06-23
**Sensitivity:** Level 2 internal. No secrets.

## Deployment/auth

- Cowork is internal/team-only for Verivolt.
- Default endpoint auth is user JWT.
- Do not introduce API keys, OAuth client credentials, per-channel send tokens, or external-consumer auth unless Bhavesh explicitly changes deployment assumptions.

## UI/session

- Session state should not wait on slow agent-name lookups before marking a run as `running`.
- `waiting_approval` state wins over completion-style events when permission requests still exist.
- Completion notifications should fire only after a session truly finishes and has no pending approvals.

## Message/history identity

- Preserve stable server IDs when mapping fetched history.
- Server history is authoritative after completion/resume.
- Do not blindly drop all id-less local messages; keep only fresh in-flight locals.
- Avoid duplicate assistant display by hiding streaming draft if it matches the latest committed assistant content.

## Scheduler

- Scheduler must be initialized after authenticated `/auth/me` verification.
- Hybrid scheduler execution target exists in Vera server memory: desktop and backend runtimes should not compete for the same scheduled task.

## MCP config

- MCP UI accepts JSON-style configs with `mcpServers`, `url`, `headers`, and `env`.
- Backend supports HTTP/SSE MCP, not stdio `command/args` configs.
- Secrets are write-only and preserved server-side unless replaced.

## Coding-agent tools

- Prefer structured project/code tools before raw Bash.
- Use `ProjectDetect`, `ProjectMemorySearch`, and `ProjectMap` at the start of coding tasks.
- Use `ProjectRunScript` for package scripts.
- Use `GitChangedByAgent` before commits to avoid unrelated dirty files.
- Use live patch tools for risky/multi-file edits when UI review is needed.

## Generated files

- Build may touch `dist-react/index.html`; do not commit generated output unless explicitly requested.
