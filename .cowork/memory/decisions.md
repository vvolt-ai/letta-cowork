# letta-cowork decisions

**Last updated:** 2026-08-31
**Sensitivity:** Level 2 internal. No secrets.

## Deployment/auth

- Cowork is internal/team-only for Verivolt.
- Default endpoint auth is user JWT.
- Do not introduce API keys, OAuth client credentials, per-channel send tokens, or external-consumer auth unless Bhavesh explicitly changes deployment assumptions.

## UI/session

- Session state should not wait on slow agent-name lookups before marking a run as `running`.
- `waiting_approval` state wins over completion-style events when permission requests still exist.
- Completion notifications should fire only after a session truly finishes and has no pending approvals.
- The inline `New Conversation` composer is the primary session-start flow. Vera-managed Letta account selection must be present there (not only in the legacy Start Session modal), and the selected connection must scope agent/model/conversation discovery, history, and session start/continuation.
- Letta account and model context are conversation-scoped. For an active conversation, an absent `lettaConnectionId` explicitly means Vera's organization-default account and must never fall back to the New Conversation draft account. Model overrides must be stored per conversation; absent model means the agent default.
- The composer model picker follows the Letta UI pattern: searchable catalog, All/Hosted/BYOK filters with counts, explicit Hosted/BYOK badges, model display name plus qualified handle, and a visible agent-default option.
- Letta compaction has a separate agent-level model. A `null` `compaction_settings.model` uses Letta's lightweight provider-specific default and can produce billing entries for a model different from the conversation model. Do not diagnose that as a dropped conversation override; inspect both conversation `model` and agent `compaction_settings.model`.

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

## Cross-platform workflow latency

- The model-facing `Bash` contract must match the Windows launcher: prefer installed Git Bash, retain PowerShell/cmd fallbacks, state the active semantics in the tool description, and never weaken host execution policy. Windows fallback guidance uses `npm.cmd`/`npx.cmd` and avoids Unix heredocs.
- Email/PO workflows must reuse supplied IDs/content, inspect attachments before Odoo verification, use one retrieval route, call direct mounted Odoo tools with exact bounded domains, and broaden only after a targeted miss. Mandatory approval/business checks do not justify repeated technical discovery.

## Email context isolation — 2026-08-31

- Cowork email UI state and new-conversation links use a scoped identity of `(accountId, folderId, messageId)`, not bare Zoho `messageId`.
- Email sessions embed an exact mailbox-scoped marker in their title. Recovery may match that marker only; subject substring matching and “only pending email” guessing are forbidden because they can attach an earlier email conversation.
- Async email detail/prompt requests are latest-wins. A response captured for a previously selected email must not overwrite the current email details or prompt.

Source: user-reported Cowork email context swapping and implementation review, 2026-08-31.
