# letta-cowork architecture memory

**Last updated:** 2026-06-23
**Sensitivity:** Level 2 internal. No secrets.

## Runtime shape

Electron app with React UI, Electron main process services, preload bridge, IPC handlers, and local client tools. It talks to `vera-cowork-server` for auth/channel/email/scheduler/backend runtime features.

## Key areas

- UI: `src/ui/`
- Electron services: `src/electron/services/`
- IPC handlers: `src/electron/ipc/handlers/`
- Preload bridge: `src/electron/preload.cts`
- Letta runtime/session code: `src/electron/libs/runner/ws/session.ts`
- Client tools: `src/electron/services/client-tools/`
- Scheduler client/runtime: `src/electron/services/scheduler/`, `src/electron/api/endpoints/scheduler.ts`, `src/electron/ipc/handlers/scheduler-handlers.ts`

## Tool architecture

`src/electron/services/client-tools/index.ts` registers tool groups:

- Letta-code compatible local tools from `runners/letta_tools/`
- `Skill` / `list_skills`
- Productivity tools from `runners/productivity.ts`
- Coding workflow tools from `runners/coding.ts`
- Direct Odoo MCP tools from `runners/odooMcp.ts`

Use direct Odoo MCP tools for Odoo reads/search/count/group/field/model inspection. Do not route Odoo lookups through Bash/scripts/legacy skills when direct mounted tools are available.

## Coding workflow tools added June 23, 2026

`runners/coding.ts` provides project-aware tools for coding agents:

- repo/package detection;
- project maps;
- code outline/search/definition/reference fallbacks;
- diagnostic/script running;
- repo-local `.cowork` project memory;
- live patch proposal/apply/reject status;
- agent-touched file tracking;
- compact git diff summaries;
- log search.

Important implementation detail: tools store live patch proposals and touched-file records under `~/.letta/cowork-tools/`, not in repo source.

## Session/state lessons

- Emit `session.status: running` immediately when a conversation id arrives; fetch agent names asynchronously so UI does not time out before status updates.
- Treat fetched server history as authoritative after completion.
- Keep truly in-flight id-less local messages only with recency guards.
- Hide streaming bubbles when partial content duplicates the last committed assistant message.
- Preserve `waiting_approval` if permission requests are pending.

## Channel/context metadata

Every channel-originated event should preserve provider-native IDs and routing context, not internal Cowork UUIDs alone:

- platform;
- provider channel/guild/thread/message ids;
- sender id/name;
- timestamp;
- policy mode and reply flag.

## Permission-state identity

For interactive `standard` / `acceptEdits` runs, the runtime session must retain the same `pendingPermissions` map captured by `createCanUseToolHandler`. Replacing that map when the real conversation ID arrives makes renderer approval responses miss the waiting resolver and hangs the turn. Register each resolver in the map before emitting `permission.request` to avoid a fast-response race.
Session approval choices support three scopes: allow once, always allow that tool for the current runtime session, and allow all tools for the current runtime session. Session grants are in-memory, survive later turns in the same runtime session, release matching already-pending parallel requests, and never auto-answer `AskUserQuestion`.

## App-update notifications, 2026-10-26

Bhavesh selected Vera-managed metadata, not automatic installation. New services/desktop-updates core + owner/main-frame IPC expose scoped status/check/snooze/version-bound browser download; renderer notice and Settings→App updates do not touch SDK ownership or active sessions. Main pins Vera origin/user/org, discards late cross-scope responses, never exposes the download URL/token to renderer, revalidates version+SHA before opening HTTPS in browser. Packaged auto checks /24h snooze; dev manual only. Authoritative UI/setup notes: docs/app-update-notifications.md, with server catalog contract in vera-cowork-server/docs/desktop-updates.md. Tests181 Node+18 Bun,169 server suites/1094 tests, browser component actions, real sandboxed and packaged-code IPC, strict signed macOS package and11 SDK fixtures passed locally. No real release published, catalog configured or deployment performed; source publication does not activate the feed. Existing users need one manual updater-capable install; CI14-day artifacts/static1.0.2 alone are not release publication. Pending own-audit edits remain separate.
