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

## Cowork HTTP 413 continuation recovery — 2026-08-31

- Standalone Cowork must handle `messages.create` HTTP 413 itself rather than relying only on a larger Vera proxy limit. If a rejected request is a tool continuation, Cowork retries once after compacting only already-executed tool returns to a 16 KB aggregate budget; it never silently truncates an ordinary user prompt or image request.
- If the compacted retry is still rejected, surface a friendly request-splitting message instead of the raw SDK `413 request entity too large` error.

Source: desktop runtime log showing `WsSession.runOneStreamTurn` failing with Express HTTP 413 after 135 seconds, 2026-08-31.

## Desktop multi-organization switching (2026-09-01)

- Cowork desktop consumes membership summaries from `/auth/me` and auth responses, and shows the active workspace selector in the sidebar account footer.
- Switching uses `POST /auth/switch-organization`; the rotated access/refresh tokens become the sole desktop/server credential context and continue syncing to the Cowork-managed environment token.
- The desktop refuses to switch while any agent run is thinking, generating, executing a tool, or waiting for approval so an in-flight run cannot cross tenant credential boundaries.
- After a successful switch, organization-scoped session, agent/connection, notification, and legacy email auto-sync state is cleared, scheduler and remote-access services are restarted under the new token, and the renderer reloads so server-backed hooks refetch for the selected organization.

## Remove Letta account selection from desktop (2026-09-01)

- New Cowork conversations and sessions always use the active organization's default Vera-managed Letta connection.
- The visible Letta account selector and its persisted draft connection selection were removed from both new-conversation surfaces. Cowork no longer lists personal or organization connection choices in the UI.
- Existing session connection metadata remains supported only for safely resuming historical sessions; it is not selectable for new work.

## Bounded Odoo processing for email-driven PO work (2026-09-01)

Source: Andrew Windows trace `2026-09-01.ndjson` (conversation `conv-16a6601a-b0cb-4163-964e-a6d96a072a4c`). A single PO-to-SO turn made 60 Odoo calls, including 48 searches and broad configured-product queries returning ~31–32k characters each.

- Generated email-processing prompts must require loading the repo `email-processing` skill before business-system calls.
- Packaged desktop builds ship that skill under `resources/skills/email-processing`; the Skill runner checks `process.resourcesPath/skills`.
- PO processing uses a <=10-read pre-write target, turn-local evidence reuse, exact-total candidate quotation matching, and one SO-line read before any product-catalog expansion.
- The deployed Odoo connector accepts AND-only scalar domain triples; prefix boolean operators, list-valued domains, and boolean values are rejected. `odoo_call_method` args/kwargs are JSON-encoded strings.
- Mounted Odoo results containing `{ ok: false }` are surfaced as tool errors rather than successful calls.
