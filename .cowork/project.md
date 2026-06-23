# letta-cowork / Vera Cowork Electron App

**Last updated:** 2026-06-23
**Owner/context:** Bhavesh / Verivolt internal Cowork desktop app
**Repo:** standalone `letta-cowork` clone
**Sensitivity:** Level 2 internal project context. No secrets stored here.

## What this project is

Electron desktop app wrapping the Letta Code agent runtime with Verivolt/Cowork UI and local client tools. It works with `vera-cowork-server` for auth, channels, schedules, emails, Letta runtime bridging, and server-side agent operations.

## Stack

- Electron 41
- React 19.2
- Vite 8
- TypeScript 6
- Tailwind 4
- Zustand 5
- Bun package manager

## Local commands

Prefer these structured scripts/tools before raw shell:

```bash
bun run transpile:electron
bun run build
bun run lint
bun run dev
```

For Electron/client-tool changes, run `bun run transpile:electron` first, then `bun run build` when practical.

## Repo rules / working style

- This repo is the standalone Electron app at workspace root, not the stale `ai-platform/services/letta-cowork` checkout.
- Avoid committing generated `dist-react/index.html` unless the user explicitly wants generated build output included.
- Existing unrelated dirty files may exist; use `GitChangedByAgent` / selected staging and avoid unrelated changes.
- Internal/team-only deployment: default auth is user JWT. Do not add API-key/OAuth-client-credentials patterns unless deployment shape changes.

## Current important tool architecture

Client tools live under:

- `src/electron/services/client-tools/types.ts`
- `src/electron/services/client-tools/index.ts`
- `src/electron/services/client-tools/runners/letta_tools/`
- `src/electron/services/client-tools/runners/productivity.ts`
- `src/electron/services/client-tools/runners/odooMcp.ts`
- `src/electron/services/client-tools/runners/coding.ts`

Recent coding-tool commit:

- `4828682 feat: add coding workflow tools`

That added/registers:

- `ProjectDetect`, `ProjectMap`
- `CodeFileOutline`, `CodeSearch`, `CodeGetDefinition`, `CodeFindReferences`, `CodeDiagnostics`
- `ProjectRunScript`
- `ProjectMemoryStatus`, `ProjectMemoryRead`, `ProjectMemoryWrite`, `ProjectMemorySearch`
- `LiveProposePatch`, `LiveApplyPatch`, `LiveRejectPatch`, `LiveDiffStatus`
- `GitChangedByAgent`, `GitDiffSummary`
- `LogSearch`

`Edit`, `MultiEdit`, `Write`, and `ApplyPatch` now record touched files for safer commits.

## Major durable decisions

- Stable message identity is required across local stream + fetched history; server history becomes authoritative after completion.
- Preserve `waiting_approval` state when permission requests are pending; do not let completion events erase approval state.
- Scheduler must initialize after `/auth/me` verification; otherwise cron jobs are not registered.
- Channel events should include explicit provider-native metadata (`platform`, provider channel/guild IDs, thread/message/sender, timestamp, policy mode, reply allowed).
- For channel policy: `reply_allowed` sends a normal Letta run and outward reply; `context_only` still sends a normal Letta run but suppresses outward reply.
- MCP UI uses Claude/OpenAI-style JSON config; HTTP/SSE supported, stdio rejected. Secrets are write-only and server-side.
- Profile phone changes require mobile OTP verification before saving.

## Known open issues / watch items

- Real LSP manager is still a stub; code definition/reference tools use fallback search.
- Rich UI for live patch proposals is not implemented yet; current support is tool-level proposal/apply/reject and compact tool-block summaries.
- Build warnings currently include Vite tsconfig-paths native support warning, dynamic import chunk warning, and large chunk warning.
- Scheduler live backend integration and notification behavior under load should be verified when scheduler work resumes.
- Email/Zoho send path has had recurring API-shape and credential-context issues; check Vera server memory before changing email flows.

## Related memory files

- `.cowork/memory/architecture.md`
- `.cowork/memory/decisions.md`
- `.cowork/memory/testing.md`
- `.cowork/memory/current-work.md`
