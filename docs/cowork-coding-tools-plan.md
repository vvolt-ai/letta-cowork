# Cowork Coding Tools Plan

**Status:** MVP implemented for local Electron client tools
**Last updated:** 2026-07-31

## Goal

Make Cowork a strong coding-agent runtime without forcing the user to repeat project context or relying on raw Bash for normal development workflows.

The design follows the best patterns from Codex, Claude Code, Aider, Continue/Cody, and live IDE editors:

- structured planning and visible progress;
- repo/project memory;
- Aider-style project mapping;
- semantic/direct coding tools before Bash;
- patch-first live editing;
- project-aware build/test tools;
- safe git summaries and agent-touched tracking;
- compact log/debug traces.

## Tool priority rule

For coding tasks, agents should prefer tools in this order:

1. `ProjectDetect`, `ProjectMemorySearch`, `ProjectMap`
2. `Read`, `ReadLSP`, `Grep`, `Glob`, `LS`
3. `LiveProposePatch` for reviewed edits, or `CodeEdit`/`CodeApplyPatch` for direct trusted edits
4. `CodeFormatFiles`, `CodeOrganizeImports`, and targeted test tools before broad project scripts
5. `ProjectRunScript` for build/test/lint/typecheck scripts
6. `GitChangedByAgent`, `GitDiffSummary`, `Git` only when the user asks for commit/push
7. `Bash` only when no direct tool exists

For domain tasks:

- Odoo → mounted Odoo tools
- Email → mail/channel tools
- Knowledge → knowledge tools
- Code → coding tools
- Shell → fallback only

## Final tool list

### Planning

Already present or planned:

- `TodoWrite`
- `EnterPlanMode`
- `UpdatePlan`
- `ExitPlanMode`

Future UI improvements:

- plan timeline cards;
- plan-step links to patch proposals/test results;
- blocked-step state.

### Project understanding

Implemented MVP:

- `ProjectDetect` — detects repo root, package manager, scripts, frameworks, important dirs.
- `ProjectMap` — compact project map with configs, entrypoints, tests, and important files.
- `ProjectContext` — existing basic context tool.
- `CodeFileOutline` — compact source-symbol outline.
- `CodeGetDefinition` — TypeScript/JavaScript language-service lookup with declaration-search fallback.
- `CodeFindReferences` — TypeScript/JavaScript language-service lookup with text-search fallback.
- `CodeSearch` — compact `rg` text/symbol search with a filesystem fallback.

Future:

- language-service support beyond TypeScript/JavaScript;
- semantic/vector code search when it offers a clear advantage over symbol and text lookup.

### Project memory

Implemented MVP:

- `ProjectMemoryBootstrap` — creates a detected, portable `.cowork/project.md` profile without overwriting an existing one.
- `ProjectMemoryStatus`
- `ProjectMemoryRead`
- `ProjectMemoryWrite`
- `ProjectMemorySearch`

Recommended repo structure:

```text
.cowork/
  project.md
  memory/
    architecture.md
    decisions.md
    workflows.md
    testing.md
    gotchas.md
    current-work.md
    archive/
```

Bootstrap creates only `.cowork/project.md`; memory topic files are created on demand when durable facts exist, avoiding empty placeholder files.

Rules:

- save distilled durable facts, not raw transcripts;
- do not save secrets;
- use portable paths;
- search memory before asking user to repeat context.

### Live file editing

Implemented MVP backend tools:

- `LiveProposePatch` — stores a patch proposal for review.
- `LiveApplyPatch` — applies an accepted patch and records touched files.
- `LiveRegeneratePatch` — creates a linked replacement for a conflicted pending proposal and preserves the original as superseded.
- `LiveUndoPatch` — reverses the exact applied selection only when affected files still match their post-apply snapshots.
- `LiveRejectPatch` — rejects a pending proposal.
- `LiveDiffStatus` — lists proposals and agent-touched files.

Implemented UI:

- expanded patch proposal card;
- unified diff rendering;
- per-file and per-hunk selection with whole-file fallback for binary/create/delete/rename patches;
- proposal reject with an optional rejection reason;
- conflict-safe apply with persistent errors when current repository state no longer matches the reviewed diff;
- structured per-file/per-hunk conflict visualization with current working-tree diffs and regeneration guidance;
- guarded two-step undo for full and partial applications;
- live proposal-status refresh.

Future: multi-stage review when users want to apply separate selections from one proposal over time.

### Development/editing

Already present:

- `Read`
- `Write`
- `Edit`
- `MultiEdit`
- `ApplyPatch`
- `ReadLSP`

Implemented coding wrappers:

- `CodeEdit` — precise repo-relative replacement with ambiguity checks, line-ending preservation, path containment, and touched-file tracking.
- `CodeApplyPatch` — direct unified-patch application through `git apply --check`, serialized per repository and tracked by patch headers.
- `CodeFormatFiles` — selects per-file adapters for repository-local Prettier, project-aware TypeScript formatting, repository-local Ruff/Black, gofmt, and rustfmt. Explicit formatter selection remains available.
- `CodeOrganizeImports` — project-aware TypeScript import sorting/combining with explicit unused-import removal modes.
- `CodeDiagnostics`

Both mutation tools enforce repository containment, serialize writes per repository, report partial failures, and record only files whose contents changed.

### Build/test/validation

Implemented MVP:

- `ProjectRunScript` — runs package scripts with detected package manager.
- `TestFindRelated` — uses Jest's native dependency graph when available, with ranked direct, same-path/basename, and import-related JavaScript/TypeScript, Python, Go, and Rust fallback matching without cross-language false matches.
- `TestRunRelated` — uses native Vitest `related` selection or Jest's dependency graph when safe and available, then falls back to discovered tests through JavaScript package runners, repository-local pytest, `go test`, or `cargo test`.
- `TestRunByName` — uses known Vitest/Jest/Bun/Node/Playwright/pytest/Go/Cargo name filters, optionally constrained to explicit test files.

Future:

- `ProjectRunBuild`
- `ProjectRunTypecheck`
- `ProjectRunLint`
- additional framework-native dependency graphs as stable discovery APIs become available.

### Git safety

Implemented MVP:

- `GitChangedByAgent` — compares agent-touched files with dirty files.
- `GitDiffSummary` — compact diff/stat summary.
- `Git` — existing structured git operations.

Rules:

- commit/push only when user explicitly asks;
- stage only selected files;
- never include unrelated dirty files silently.

### Logs/debugging

Implemented MVP:

- `LogSearch` — search local logs without raw Bash grep.
- `LogTail` — existing tail helper.
- `ToolTraceSearch` — searches redacted local NDJSON traces by text, tool, status, agent, conversation, or time.
- `RunTimeline` — derives proposal, regeneration, application, diagnostics, and targeted-test events from those traces and emits explicit `applies`, `superseded_by`, and `validates` links. The chat UI renders the result as a connected timeline.

Future:

- richer framework-native validation correlations and persisted run labels.

## MVP implementation batch

Implemented in:

- `src/electron/services/client-tools/runners/coding.ts`
- registered from `src/electron/services/client-tools/index.ts`

MVP tools:

```text
ProjectDetect
ProjectMap
CodeEdit
CodeApplyPatch
CodeFormatFiles
CodeOrganizeImports
TestFindRelated
TestRunRelated
TestRunByName
ProjectRunScript
ProjectMemoryBootstrap
ProjectMemoryStatus
ProjectMemoryRead
ProjectMemoryWrite
ProjectMemorySearch
LiveProposePatch
LiveRegeneratePatch
LiveApplyPatch
LiveUndoPatch
LiveRejectPatch
LiveDiffStatus
GitChangedByAgent
GitDiffSummary
LogSearch
ToolTraceSearch
RunTimeline
```

`LiveProposePatch` results render as expanded review cards. The renderer fetches stored proposal data by ID, shows the unified diff and validation plan, and routes Apply/Reject clicks back through the registered client tools so extension hooks, tracing, race protection, and touched-file recording remain active.

## Next implementation batch

Started on 2026-06-23:

1. `CodeDiagnostics` — MVP added. Runs the smallest available diagnostic script (`transpile:electron`, `typecheck`, or `build`) or falls back to `npx tsc --noEmit`.
2. `CodeFileOutline` — MVP added. Extracts imports, exports, functions, classes, interfaces, types, and important constants from source files.
3. `CodeSearch` — MVP added. Uses `rg` for compact code search instead of Bash grep/find.
4. `CodeGetDefinition` — MVP fallback added. Searches definition-like patterns for a symbol.
5. `CodeFindReferences` — MVP fallback added. Searches likely symbol references.
6. Agent-touched tracking — extended to existing `Edit`, `MultiEdit`, `Write`, and `ApplyPatch` tools.
7. Tool block summaries — added compact summaries for live patch, project-memory, project-script, and code-intelligence tools.
8. Real LSP-backed `CodeGetDefinition` / `CodeFindReferences` — added project-aware TypeScript/JavaScript language intelligence with fallback search.
9. `ToolTraceSearch` — added structured, redacted local NDJSON traces at the central client-tool execution boundary.
10. Rich `LiveProposePatch` review cards — added diff rendering, risk/file/validation context, live status refresh, and traced Apply/Reject actions over proposal-ID-only IPC.
11. `ProjectMemoryBootstrap` — added race-safe, non-overwriting generation of a detected, portable `.cowork/project.md` profile and status guidance for repositories without one.
12. `CodeEdit` / `CodeApplyPatch` — added repository-contained direct-edit wrappers, serialized patch application, touched-file tracking, compact UI summaries, and accurate success-with-warning results if tracking storage fails after a mutation.
13. `CodeFormatFiles` / `CodeOrganizeImports` — added explicit-file formatting, safe import organization, changed-file-only attribution, and TypeScript language-service edits.
14. Related-test tooling — added scored related-test discovery plus targeted related/name execution with Vitest, Jest, Bun, Node, Playwright, and package-script runner detection.
15. Granular live patches — added proposal-owned file/hunk IDs, partial application, conflict-safe preflight, per-file/hunk UI selection, exact applied-patch storage, and post-apply-state-guarded undo.
16. Assisted live-patch conflict handling — added stored per-file/per-hunk conflict reports, current-diff context, linked immutable regeneration, supersession retention, and conflict-aware review UI.
17. Multi-language adapters — added Ruff/Black, gofmt, and rustfmt formatting plus Python/Go/Rust related-test discovery and pytest/Go/Cargo execution adapters.
18. `RunTimeline` — added a structured repository run timeline that links proposals and applications to subsequent diagnostics and targeted test runs, with a dedicated timeline card.
19. Framework-native related tests — added Jest dependency-graph discovery with safe heuristic fallback and Vitest native `related --run` execution for simple local Vitest scripts.

Next candidates:

1. Named validation runs and comparison across multiple patch iterations.
2. Optional multi-stage review that keeps unselected live-patch changes pending.

## Validation guidance

For `letta-cowork` changes:

```bash
bun run transpile:electron
bun run build
```

Run `bun run transpile:electron` first for Electron client-tool changes.
