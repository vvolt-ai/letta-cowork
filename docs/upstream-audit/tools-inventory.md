# Client Tools Inventory — upstream vs ours

File-level comparison of `tools/impl/` (upstream) vs `letta_tools/` (our two forks).

Generated at **upstream `letta-code@v0.25.10`**, **audit date 2026-05-19**.

## Tool matrix (canonical `letta_v1` tools only)

| Tool | Upstream `tools/impl/` | letta-cowork `letta_tools/` | vera-server `letta_tools/` | Notes |
|---|---|---|---|---|
| `ApplyPatch` | ✅ | ✅ | ✅ | Synced |
| `AskUserQuestion` | ✅ | ✅ | ❌ | Vera-server: intentional (no UI). |
| `Bash` | ✅ | ✅ (`runners/bash.ts`) | ✅ (`runners/bash.ts`) | Synced |
| `BashOutput` | ✅ | ✅ | ✅ | Synced |
| `CreateGoal` | ✅ | ❌ | ❌ | **Gap.** Goal tracking — paired with `GetGoal`/`UpdateGoal`. |
| `CreateWorktree` | ✅ (NEW) | ❌ | ❌ | **Gap.** Just landed upstream. Git-worktree integration for parallel work. |
| `Edit` | ✅ | ✅ | ✅ | Synced |
| `EnterPlanMode` | ✅ | ❌ | ❌ | **Gap.** Pairs with `ExitPlanMode` + reminders/planModeReminder. |
| `ExitPlanMode` | ✅ | ❌ | ❌ | Same. |
| `GetGoal` | ✅ | ❌ | ❌ | **Gap.** |
| `Glob` | ✅ | ✅ | ✅ | Synced |
| `Grep` | ✅ | ✅ | ✅ | Synced |
| `KillBash` | ✅ | ✅ | ✅ | Synced |
| `LS` | ✅ | ✅ | ✅ | Synced |
| `Memory` | ✅ | ❌ | ❌ | **Gap.** Direct memory-edit tool. |
| `MemoryApplyPatch` | ✅ | ❌ | ❌ | **Gap.** Patch-style memory edits. |
| `MessageChannel` | ✅ (NEW) | ❌ | ❌ | **Gap.** Send outbound messages through channel plugins. |
| `MultiEdit` | ✅ | ✅ | ✅ | Synced |
| `Read` | ✅ | ✅ | ✅ | Synced |
| `ReadLSP` | ✅ | ✅ | ❌ | Vera-server: intentional (no LSP servers). |
| `Shell` | ✅ | ❌ | ❌ | Alternative to Bash (?). Investigate if there's a reason to add. |
| `ShellCommand` | ✅ | ❌ | ❌ | Same. |
| `Skill` | ✅ | ✅ (`runners/skill.ts`) | ✅ (`runners/skill.ts`) | Synced |
| `Task` | ✅ | ✅ | ✅ | Synced (vera-server added it after the ws-session.ts comment was written) |
| `TaskOutput` | ✅ | ✅ | ✅ | Synced |
| `TaskStop` | ✅ | ✅ | ✅ | Synced |
| `TodoWrite` | ✅ | ✅ | ✅ | Synced |
| `UpdateGoal` (desc-only) | ✅ | ❌ | ❌ | **Gap.** Goal-system family. |
| `UpdatePlan` (desc-only) | ✅ | ❌ | ❌ | **Gap.** Plan-mode family. |
| `ViewImage` | ✅ | ✅ | ✅ | Synced |
| `Write` | ✅ | ✅ | ✅ | Synced |

## Provider-skinned variants (we don't need)

Upstream ships parallel implementations for Gemini-style and Codex-style models. Our agents all use `letta_v1` schemas, so these don't apply:

- `GlobGemini`, `GrepFiles` (Gemini's name for Grep), `ListDirCodex`, `ListDirectoryGemini`, `ReadFileCodex`, `ReadFileGemini`, `ReadManyFilesGemini`, `ReplaceGemini` (Gemini's edit tool), `RunShellCommandGemini`, `SearchFileContentGemini`, `WriteFileGemini`, `WriteTodosGemini`.

## Summary

| Bucket | Count | Notes |
|---|---|---|
| Synced across all three | **15** | The core CRUD + Bash + Task family |
| Cowork has, vera-server doesn't (intentional) | **2** | AskUserQuestion, ReadLSP |
| Upstream has, neither of ours has | **13** | CreateGoal, CreateWorktree, EnterPlanMode, ExitPlanMode, GetGoal, Memory, MemoryApplyPatch, MessageChannel, Shell, ShellCommand, UpdateGoal, UpdatePlan, (+ goal/plan-mode descriptions only) |
| Provider variants (we don't need) | **12** | Gemini + Codex re-skins |

## Recommended port priority

If we port tools one-at-a-time, this is the order I'd do:

1. **`MessageChannel`** — directly useful for our channel architecture. Lets agents send messages out without going through the runtime layer.
2. **`Memory` + `MemoryApplyPatch`** — agents editing their own memory in-band beats the SDK roundtrip.
3. **`CreateWorktree`** — Bhavesh's parallelization work would benefit. Lets agents spin up isolated trees for parallel changes.
4. **`EnterPlanMode` + `ExitPlanMode` + `UpdatePlan`** — together with `reminders/planModeReminder.ts`, this is a complete planning workflow.
5. **`CreateGoal` + `GetGoal` + `UpdateGoal`** — goal-tracking. Lower priority than plan-mode.
6. **`Shell` + `ShellCommand`** — investigate first. May just be alternative shells for non-bash environments; if so, skip.

## Where each tool lives in our trees

```
letta-cowork:
  src/electron/services/client-tools/runners/letta_tools/{Tool}.ts
  src/electron/services/client-tools/runners/{bash,fs,skill}.ts
  src/electron/services/client-tools/runners/_shared/  ← shared helpers
  src/electron/services/client-tools/runners/shell/    ← shell launchers
  src/electron/services/client-tools/lsp/manager.ts    ← LSP only here

vera-cowork-server:
  src/letta-runtime/client-tools/runners/letta_tools/{Tool}.ts
  src/letta-runtime/client-tools/runners/{bash,fs,skill}.ts
  src/letta-runtime/client-tools/runners/_shared/      ← shared helpers
  src/letta-runtime/client-tools/runners/shell/        ← shell launchers
  (no LSP — intentional)

letta-code (upstream):
  src/tools/impl/{Tool}.ts                             ← runners
  src/tools/descriptions/{Tool}.md                     ← agent-facing descriptions
  src/tools/schemas/{Tool}.json                        ← JSON Schemas
```

**Structural observation:** upstream cleanly separates impl/descriptions/schemas. Our forks bundle these — each `{Tool}.ts` file inline-defines the schema. When we port new tools, copying upstream's split is worth considering for clarity, but probably not worth refactoring existing tools just for the structure.
