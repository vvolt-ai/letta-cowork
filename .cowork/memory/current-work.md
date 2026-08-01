# letta-cowork current work

**Last updated:** 2026-07-31

## Recently completed

- Completed the current coding-agent roadmap through LSP intelligence, structured tracing/timelines, rich patch review and regeneration, project-memory bootstrap, direct edits, polyglot formatting/testing, granular patch apply/undo, and native Jest/Vitest related-test selection.
- `bun run transpile:electron` and `bun run build` pass.
- Isolated compiled-runtime smoke tests cover formatting, import organization, related-test discovery/execution/cancellation, partial patch application, conflicts, and guarded undo.
- The completed batch is tracked in the repository's coding-tools commit.

## Pending / likely next

1. Named validation runs and comparison across multiple patch iterations.
2. Optional multi-stage review that keeps unselected live-patch changes pending.

## Repo status at creation time

After commit `4828682`, remaining dirty files were:

```text
M .gitattributes
M dist-react/index.html
```

These were intentionally not included in the coding-tools commit.

## 2026-07-25 built-in browser automation

- Added native Cowork client-tools backed by Playwright in `src/electron/services/client-tools/runners/browser.ts` and registered them from `src/electron/services/client-tools/index.ts`.
- Tools: `BrowserNavigate`, `BrowserSnapshot`, `BrowserClick`, `BrowserType`, `BrowserWaitFor`, `BrowserTakeScreenshot`, `BrowserConsoleMessages`, `BrowserNetworkRequests`, `BrowserClose`.
- Safety default: `BrowserNavigate` only allows localhost URLs unless the tool call passes `allowExternal: true` after explicit user approval.
- Added `playwright` dependency and installed Chromium locally with `bunx playwright install chromium` for this machine.
- Validation: `bun run transpile:electron` and `bun run build` passed. Build required removing deprecated `baseUrl` from `tsconfig.app.json` for TypeScript 7.

### Preview default update

- Updated `BrowserNavigate` / Playwright session creation to default to headed Chromium (`headless: false`) so Cowork users can see a live browser preview while the agent tests pages.
- Agents can still pass `headless: true` for background checks.

## 2026-07-31 structured tool tracing

- Added central tracing at `runClientTool()` so main-session, subagent, and remote client-tool executions produce the same completed trace records.
- Local traces live in `~/.letta/cowork-tools/tool-traces/YYYY-MM-DD.ndjson`, are bounded/redacted, and expire after 30 days. `runtimeEnv` is never persisted.
- Added `ToolTraceSearch` filters for free text, tool, status, agent, conversation, time, and result limit; default lookback is 24 hours.
- Threaded upstream tool-call/request IDs into `ToolRunContext.toolCallId` for call/result/trace correlation.
- Validation passed: Electron transpilation, production build, and isolated runtime smoke test for search, correlation, status, and secret redaction.

## 2026-07-31 rich live-patch review UI

- Completed the `LiveProposePatch` review card in `ToolBlocks.tsx`: unified diff highlighting, title/summary, repository, risk, changed files, validation plan, status, rejection reason, and Apply/Reject controls.
- Added proposal-ID-only Electron IPC/preload APIs. The renderer cannot submit arbitrary patches or repository paths through this bridge.
- Renderer Apply/Reject actions execute registered `LiveApplyPatch` / `LiveRejectPatch` tools, preserving extension denial hooks, structured traces, `git apply --check`, and agent-touched recording.
- Proposal and touched-file JSON writes are atomic and serialized in-process. Apply/reject terminal transitions cannot both win; proposal IDs now include UUID entropy while old numeric IDs remain readable.
- Patch-header files are authoritative; declared `files` must match them to prevent misleading review metadata.
- Open cards refresh stored status every four seconds and reject stale refreshes by `updatedAt`.
- Validation passed: Electron transpilation, production build, and isolated temporary-Git lifecycle test covering create/get/apply/reject, file-mismatch rejection, and concurrent apply-vs-reject behavior.

## 2026-07-31 project-memory bootstrap

- Added `ProjectMemoryBootstrap`, which creates a detected `.cowork/project.md` profile for repositories without one.
- Generated profiles contain only portable repo-relative paths, detected package manager/frameworks, safe package-script invocations, important paths, likely entrypoints, and concise memory/workflow guidance.
- Bootstrap is idempotent, uses exclusive creation, handles concurrent calls, never overwrites an existing profile, and rejects a symlinked/non-directory `.cowork` base.
- `ProjectMemoryStatus` now recommends bootstrap when the profile is missing and recommends reading/searching memory when it exists.
- Topic memory files are deliberately not pre-created; `ProjectMemoryWrite` creates them on demand when durable facts exist.
- Validation passed: Electron transpilation, production build, and isolated temporary-repository tests for creation, detection, concurrency, portability, idempotency, and preservation of existing content.

## 2026-07-31 direct code-edit wrappers

- Added `CodeEdit`: accepts a repository path plus repo-relative file, rejects path/symlink escapes, refuses ambiguous matches unless replacement count intent is explicit, preserves CRLF files, serializes writes per file, and records successful mutations as agent-touched.
- Added `CodeApplyPatch`: accepts a standard unified Git patch, derives touched files from patch headers, serializes application per repository, runs `git apply --check` before apply, and records successful mutations.
- Live patch application now shares the same per-repository patch lock, preventing simultaneous patch applications from racing within a process.
- Touched-file tracking failures after a successful mutation no longer turn the whole tool result into a misleading failure. Coding wrappers and live apply return success with `trackingWarning`; existing Edit/Write/MultiEdit/ApplyPatch tools append an explicit warning.
- Codex-style `ApplyPatch` touched-file parsing now records `Move to` destinations as well as source paths.
- Added compact renderer summaries/labels for bootstrap and direct-edit tools.
- Validation passed in an isolated repository for wire registration, precise and multi-match edits, ambiguity refusal, CRLF preservation, path traversal and symlink rejection, checked patch application, touched-file attribution, failed-operation exclusion, and success/error tracing.
- Follow-up hardening: `noteToolTouchedFiles` now canonicalizes absolute file and repository paths before containment checks. This fixes missed attribution on macOS temporary paths where `/var/...` resolves to `/private/var/...`; deleted/moved files fall back to canonical parent resolution. A regression smoke test confirmed existing `Edit` attribution and both source/destination attribution for `ApplyPatch` moves.

## 2026-07-31 formatting, imports, and targeted tests

- Added `CodeFormatFiles` with repository-local Prettier preference and project-aware TypeScript/JavaScript fallback; added `CodeOrganizeImports` with all, sort/combine, and remove-unused modes.
- Both tools enforce repository containment, serialize writes, preserve accurate changed-file attribution, and return partial results when a formatter mutates a file before failing.
- Added `TestFindRelated`, `TestRunRelated`, and `TestRunByName`; discovery includes tracked and untracked tests and scores direct paths, matching names, and imports.
- Runner detection supports package scripts plus local Vitest/Jest/Playwright, Bun, and Node test runner. Assertion failures are structured failed results; abort signals produce cancelled results.
- Runtime smoke tests covered TS formatting/idempotency, import modes, local Prettier success/partial failure, untracked related tests, Vitest and npm arguments, name filters, and cancellation.
- Permission classification no longer treats every `Code*` tool as read-only: mutating code tools are edit operations, diagnostics/test execution still require standard approval, and `LiveUndoPatch` requires an explicit prompt even in accept-edits mode.

## 2026-07-31 granular live patch review and undo

- Stored proposals now expose deterministic proposal-owned file/hunk IDs. The UI defaults to all changes selected and supports deselecting whole files or individual safe modification hunks; create/delete/rename/binary sections remain whole-file only.
- Applying a subset stores the exact selected patch, applied IDs/files, and post-apply file snapshots. Unselected changes are terminally discarded and the proposal records `partially_applied`.
- Apply failures preserve `pending` state and show a persistent repository-mismatch conflict error.
- Added `LiveUndoPatch` plus a two-step UI confirmation. Undo verifies every affected file still exactly matches its post-apply state, then reverse-checks and reverses the exact applied patch; otherwise it refuses without changing proposal state.
- Runtime smoke tests covered two-file/two-hunk selection, exact partial undo, changed-file undo refusal, conflict preservation, and unknown selection rejection.

## 2026-07-31 framework-native related tests

- `TestFindRelated` now asks repository-local Jest for `--findRelatedTests --listTests --json` and reports `strategy: jest-dependency-graph`; runner errors safely fall back to existing heuristic matching with a warning.
- `TestRunRelated` runs the exact Jest graph result through the selected script, or uses repository-local `vitest related --run` with source inputs when the Vitest script is simple enough to bypass safely.
- Native output paths are canonicalized and containment-checked, runtime secrets are redacted from fallback warnings, and discovery honors cancellation.
- Electron transpilation and production build passed. Isolated smoke tests covered Jest graph selection/execution, Jest fallback, and Vitest native argument selection.
