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
