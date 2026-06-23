# Cowork Coding Tools Plan

**Status:** MVP implemented for local Electron client tools
**Last updated:** 2026-06-23

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
3. `LiveProposePatch` for reviewed edits, or `Edit`/`MultiEdit`/`ApplyPatch` for direct trusted edits
4. `ProjectRunScript` for build/test/lint/typecheck scripts
5. `GitChangedByAgent`, `GitDiffSummary`, `Git` only when the user asks for commit/push
6. `Bash` only when no direct tool exists

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

Future:

- `CodeFileOutline`
- `CodeGetDefinition`
- `CodeFindReferences`
- `CodeSearch` hybrid text/symbol/semantic search

### Project memory

Implemented MVP:

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

Rules:

- save distilled durable facts, not raw transcripts;
- do not save secrets;
- use portable paths;
- search memory before asking user to repeat context.

### Live file editing

Implemented MVP backend tools:

- `LiveProposePatch` — stores a patch proposal for review.
- `LiveApplyPatch` — applies an accepted patch and records touched files.
- `LiveRejectPatch` — rejects a pending proposal.
- `LiveDiffStatus` — lists proposals and agent-touched files.

Future UI:

- patch proposal card;
- file/hunk diff rendering;
- accept/reject per file and per hunk;
- conflict/rebase support;
- undo patch.

### Development/editing

Already present:

- `Read`
- `Write`
- `Edit`
- `MultiEdit`
- `ApplyPatch`
- `ReadLSP`

Future wrappers:

- `CodeEdit`
- `CodeApplyPatch`
- `CodeFormatFiles`
- `CodeOrganizeImports`
- `CodeDiagnostics`

### Build/test/validation

Implemented MVP:

- `ProjectRunScript` — runs package scripts with detected package manager.

Future:

- `ProjectRunBuild`
- `ProjectRunTypecheck`
- `ProjectRunLint`
- `TestFindRelated`
- `TestRunRelated`
- `TestRunByName`
- `CodeDiagnostics`

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

Future:

- `ToolTraceSearch`
- `RunTraceSummary`
- structured tool-call timeline in UI.

## MVP implementation batch

Implemented in:

- `src/electron/services/client-tools/runners/coding.ts`
- registered from `src/electron/services/client-tools/index.ts`

MVP tools:

```text
ProjectDetect
ProjectMap
ProjectRunScript
ProjectMemoryStatus
ProjectMemoryRead
ProjectMemoryWrite
ProjectMemorySearch
LiveProposePatch
LiveApplyPatch
LiveRejectPatch
LiveDiffStatus
GitChangedByAgent
GitDiffSummary
LogSearch
```

## Next implementation batch

Started on 2026-06-23:

1. `CodeDiagnostics` — MVP added. Runs the smallest available diagnostic script (`transpile:electron`, `typecheck`, or `build`) or falls back to `npx tsc --noEmit`.
2. `CodeFileOutline` — MVP added. Extracts imports, exports, functions, classes, interfaces, types, and important constants from source files.
3. `CodeSearch` — MVP added. Uses `rg` for compact code search instead of Bash grep/find.
4. `CodeGetDefinition` — MVP fallback added. Searches definition-like patterns for a symbol.
5. `CodeFindReferences` — MVP fallback added. Searches likely symbol references.
6. Agent-touched tracking — extended to existing `Edit`, `MultiEdit`, `Write`, and `ApplyPatch` tools.
7. Tool block summaries — added compact summaries for live patch, project-memory, project-script, and code-intelligence tools.

Still pending:

1. Real LSP-backed `CodeGetDefinition` / `CodeFindReferences` using a non-stub LSP manager.
2. Rich UI cards for `LiveProposePatch` proposals with diff rendering and accept/reject actions.
3. `ToolTraceSearch` backed by structured tool-call logs.
4. `.cowork/project.md` bootstrapping command for repos that do not have memory yet.
5. Extend touched-file tracking to future `CodeEdit` / `CodeApplyPatch` wrappers.

## Validation guidance

For `letta-cowork` changes:

```bash
bun run transpile:electron
bun run build
```

Run `bun run transpile:electron` first for Electron client-tool changes.
