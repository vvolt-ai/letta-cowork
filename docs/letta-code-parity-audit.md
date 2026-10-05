# Letta Code parity audit

**Date:** 2026-10-02
**Status:** Source-verified comparison; implementation/integration gates remain open.
**Sensitivity:** Internal engineering; no credentials or live memory content.
**Source:** upstream `37c2ab0fc80b58bff0fc2ccdbe838a2d72d45bf7`; historical baseline `b69da0ee2aa2afa348e6975055ed804cb127f172`. Cowork/Vera current working trees include the uncommitted security batch and earlier unrelated edits.
**Rule:** Follow [migration guide](letta-code-runtime-migration.md), especially P0.1–P0.3, P1.1–P1.3 and validation gates. Compare implementation contracts, not only package versions or names.

## Implementation update after audit — 2026-10-02

The initial findings below describe the audit baseline. Subsequent local code now fixes Master **new-file** root headers/indexes, establishes AsyncLocalStorage tool contexts, scopes the Vera **channel-session checkout hook** to the actual SDK client, and registers owned SetWorkingDirectory in both runtimes. Tests/build receipts are in the companion migration guide (20 desktop, 35 server focused tests). Global managed-policy/controller paths, metadata repair for old malformed root files, reopen/remote persistence, full project/skill refresh and the remaining missing tools are still pending. No live memory mutations or deployment were performed. Do not read the historical rows as claiming those fixes were absent after this update, nor the update as full parity.

## Further implementation update — 2026-10-05

Wake now uses the existing durable server scheduler (source registered in both clients; SQL deployment pending). Agent is a Task compatibility alias, not a new/background executor. Vera ReadLSP now has real scoped TS/JS project diagnostics and a production compiler dependency. Those historical missing rows are addressed to these documented limits. Monitor/WatchPR/Workflow, background task lifecycle, async questions, interactive shell, worktree, artifact and remaining account/memory routes are still unfinished. Migration guides carry tests and unapplied deployment requirements.

## Findings first

1. The previous migration was a selected security-port batch, not a complete parity audit or full latest-runtime migration.
2. Upstream has **31 internal bundled definitions**. Source/AST comparison finds **12 without the same implementation name in Cowork**, and **14 in Vera** (normalizing the asynchronous question name). Dynamic extensions, mounted remote MCP and deployment-specific tools are excluded; these are not total session tool counts.
3. Only **Wake and WatchPR are newly added user-facing tools since our baseline**. AskUserQuestion changed to an asynchronous implementation under the same user-facing name. Workflow, Monitor and several other missing tools predate this pull.
4. Same-name tools still have important differences: Task/Agent, Bash background execution, questions, image returns and model-specific catalogs.
5. Two memory gaps and a runtime-context gap deserve attention before adding large new tool families. No live agent memory or instructions were changed during this audit.

## Tool inventory and applicability

Upstream evidence: `src/tools/tool-definitions.ts`, `toolset-catalog.ts`, `tool-name-mapping.ts`, `manager.ts`. Local evidence: `src/electron/services/client-tools/index.ts` and `runners/letta_tools/index.ts`; Vera `src/letta-runtime/client-tools/index.ts` and its runner index. Source inspection/AST extraction did not import or execute runtime tools.

| Upstream feature | Cowork | Vera | Behavioral contract / migration decision |
|---|---|---|---|
| **Wake** — new (`549edb9d9`) | Missing | Missing | Durable future turn, self-bound to current agent/conversation; create/list/cancel, delays/time/cron. Cowork `Reminders` only stores JSON; it does not fire turns. Vera scheduler is a candidate backend, not an already equivalent tool. Preserve execution-target/account/principal ownership. |
| **WatchPR** — new (`44b154e45`) | Missing | Missing | PR CI/review/mergeability watch with scoped event notifications and cancellation. Git status/log tools or log polling are not equivalent. Requires authenticated gh on execution host, bounded events and exactly-once completion. |
| **AskUserQuestion** — new async implementation (`5756b2735`) | Synchronous implementation/UI path exists | Not bundled in server registry | Upstream internal `AskUserQuestionAsync` returns version-2 question receipt with executor-provided toolCallId; answers/dismissal arrive later. Current name presence is not async parity. Do not pretend headless channels have an interactive dialog. |
| **Workflow** — older (`b25271add`) | Missing | Missing | Deterministic scripts, validated metadata/results, pipeline/fan-out, phase/token progress, background ID and notification, TaskStop cancellation. Explicit user orchestration opt-in is part of upstream description. SDK dependency alone does not register it. |
| **Monitor** — older | Missing | Missing | Long-lived shell/WebSocket events, batching/rate limits, acting-user/scope, timeout/cancel and terminal coverage. Background output maps or LogTail are not monitor ownership/delivery. |
| **SetWorkingDirectory** — older (`4663d4349`) | Missing | Missing | Changes later tools within runtime; project instructions/skills refresh next turn. Bash `cd` changes one process only. Implement scoped state/persistence first, never process.chdir for a shared server. |
| **EnterWorktree / ExitWorktree** — older | Missing | Missing | Provision/enter/lock isolated Git workspace; later release/cleanup must preserve user data and ownership. Existing Git tool is not a worktree lifecycle. Branch placement and cleanup keep explicit authorization. |
| **exec_command / write_stdin** — older | Missing | Missing | Owned interactive shell sessions, bounded yield, follow-up stdin/interrupt/output. Foreground Bash plus BashOutput/KillBash is not equivalent. Needs runner/transport/session design. |
| **SendAgentMessage** — older | No bundled exact implementation | Authorized Vera messaging equivalent exists under different name | Upstream also resumes spawned/native workers and their sessions. Vera's list_available_agents / send_message_to_agent_and_wait_for_reply resolve/recheck publication grants. Adapt existing authorized bridge; never replace it with raw-ID broad access or duplicate it blindly. Cowork can reach Vera through its bridge/mod, not this built-in name. |
| **read_artifact_file / write_artifact_file** — older | Missing | Missing | Experiment-gated artifact virtual workspace; ordinary Read/Write do not provide its storage contract. Upstream manager adds these only when artifacts experiment is enabled. Lower priority until artifact owner/UI design is chosen. |
| **Task exposed as Agent** | Task exists; Agent alias absent | Task exists; Agent alias absent | Upstream `tool-name-mapping.ts` maps Task→Agent. This is an alias, not a second delegation engine. Add compatibility mapping only when schema/call/history routing is tested. |
| **ReadLSP** | Implemented for TS/JS via real project-aware language service | Not in bundled registry | Cowork is not an LSP stub: `client-tools/lsp/manager.ts` uses typescript-lsp LanguageService. Server parity is missing. Do not assume all languages or upstream protocol behavior are supported. |

**Exact missing internal names in both:** EnterWorktree, ExitWorktree, Monitor, SendAgentMessage, SetWorkingDirectory, Wake, WatchPR, Workflow, exec_command, write_stdin, read_artifact_file, write_artifact_file. Vera additionally lacks AskUserQuestionAsync/AskUserQuestion and ReadLSP. Agent wire alias is an additional naming gap, not included in those counts.

Upstream presets differ: Claude/default uses Bash and Task CRUD; Codex uses exec_command/write_stdin/ApplyPatch; Letta unified preset combines its own subset. None is a real empty built-in preset while connected tools remain. Worktree settings, experiment flags, client allowlists and conversation-local preferences further filter actual availability. Our `getClientToolsForWire()` returns our registry rather than this preference/catalog contract. Do not advertise all 31 as always active upstream.

## Existing-tool implementation comparison

| Surface | Source-backed result | Evidence |
|---|---|---|
| Bash | Upstream foreground yield is 10 seconds with owned background completion; our Cowork runner rejects run_in_background, server contract also retains synchronous restriction. Latest Windows native-shell default differs from our tested Git-Bash-first launcher. These are behavior differences, not missing Bash. | Upstream `impl/bash.ts` DEFAULT_FOREGROUND_YIELD_MS and `tool-definitions.ts` Windows description; local `runners/bash.ts`, `test/bash-runtime-secrets.test.mjs`, `test/windows-shell-contract.test.mjs`. |
| Task/Agent | Upstream always-background receipts/notifications, native claude-code/codex workers, computer routing and optional MCP discovery inheritance. Cowork is synchronous/fresh API conversation, subagent_type informational; Vera has specialist resolution/limits but rejects background and uses bounded timeout. Local schema still advertises a background option that implementation rejects. Preserve our intentional **no model override** rule rather than copying upstream `model`. | Upstream `impl/task.ts:977`, `schemas/Task.json`; both local Task implementations and schemas; guide P1.1. |
| Task CRUD | Sampled TaskUpdate validation aligns (nonempty taskId, allowed statuses, metadata object, string-array dependencies). This does not prove full task-store ownership/persistence parity. | Upstream `impl/task-update.ts` versus Cowork `letta_tools/TaskUpdate.ts`. |
| ApplyPatch | Both local implementations reject duplicate resolved paths via a seen Set before applying. Do not reimplement that older P0.3 item. | Cowork ApplyPatch.ts:419–426; Vera counterpart:423–430. |
| Read/ViewImage/tool returns | Cowork adapter replaces image blocks with `[Image content omitted from text result]`; ToolRunResult is output:string/isError:boolean. Registered ViewImage or supported input attachments do not imply native image tool-return parity. Requires typed transport, redaction/clamping, history and renderer changes together. | Cowork `client-tools/types.ts:50`, `letta_tools/index.ts:124–145`; guide P0.3. |
| Secret output / overflow | Current security batch adds ambient+retained secrets and pre-spawn Windows guard in both runtimes. Prior 17/27 focused tests/build receipts establish that batch only; not full manager/hook/session parity. | Migration guide 2026-10-02 batch; runtime-secrets.ts, client-tools/index.ts, Bash; focused regression suites. |
| Skills | Existing agent-memory skills/resource manifests are supported; attached-repository discovery and next-turn refresh need a trusted attachment/CWD contract. No arbitrary repository inference. | Prior migration guide 2026-08-25; local skill discovery; upstream SetWorkingDirectory contract. |
| Compatibility tools | Upstream removed old names including BashOutput, KillBash, TaskOutput, TodoWrite, MultiEdit and memory/memory_apply_patch from this definition set. Our retained API/history tools must not be deleted just to copy catalog names. | AST diff of tool-definitions at b69..37; guide explicit non-ports. |

## P0 memory and runtime-context findings

### 1. Root MemFS creation header does not match upstream v2 validation — confirmed synthetic reproduction

Vera `master-agent-access/master-memfs.service.ts:306–307` creates `description` plus `limit` frontmatter for all new paths. Root path selection exists, but header selection is not format-specific. Upstream `src/memory-frontmatter.ts:64–66,109–110` requires root v2 `name` and `description` and rejects `limit`; MEMORY.md indexes must not have frontmatter.

A pure probe executed the actual upstream validator against a synthetic current creation header:

- legacy `system/identity.md`: zero errors;
- root `identity.md`: **unknown frontmatter key limit**, **missing required field name**.

This is confirmed content-validator incompatibility, **not** a claim that a live root Git push was attempted/rejected. The Test TEst migration used legacy system/ files, so this does not invalidate that receipt. Fix format-aware creation, indexes and constraints; preserve old files and caller-approved metadata. Do not silently rewrite live governance.

### 2. Scoped Master Git support does not fix global runtime MemFS — confirmed separate adapters

MasterMemFsService resolves the target organization explicitly and refuses environment/personal fallback. General Vera `letta-memfs/memfs.service.ts` still reads configured LETTA_BASE_URL/LETTA_API_KEY and a shared cache root; getToken returns that configured key. Therefore successful Master remote file read-back is not proof that every organization-specific runtime tool sees the same checkout. Account-scoped hooks/cache/credential lifecycle plus multi-account tests are required (guide P0.1).

### 3. CWD/identity shim is process-global, not upstream scoped context — source risk, not reproduced concurrency incident

Both `runners/_shared/runtime-context.ts` copies keep module-level activeSnapshot and fallback process env/CWD. Cowork ToolRunContext has agent/account fields but no authoritative workingDirectory field; makeTool threads identity fields, not a scoped CWD store. Upstream SetWorkingDirectory calls switchRuntimeWorkingDirectory with runtime context and next-turn refresh.

Before adding a setter, audit production bindings and prove isolation across two simultaneous sessions and nested Task calls. Resource-aware file locks are not automatically runtime-context isolation. No cross-session race was executed or declared reproduced in this audit.

## Priority and acceptance gates

1. **P0:** Root/legacy MemFS header + constraints compatibility; scoped runtime memory connection/cache; authoritative per-turn CWD/identity. Synthetic validator tests, symlink/read_only tests and two-account/two-conversation concurrent isolation required.
2. **P0/P1:** Native image tool-return contract and schema truth (remove/clarify unsupported background advertising). Keep safe compatibility names for in-flight turns.
3. **P1:** Conversation client-preference/model toolset catalog and Agent alias; source/model/tool-return/history tests before changing advertised tools. Retain no-model-override and Vera grants.
4. **P1:** SetWorkingDirectory after context work; Wake via Vera scheduler with self-binding, selected connection and hybrid execution target; async questions with receipt/answer/dismissal lifecycle.
5. **P1/P2:** Owned background process/task engine before Monitor, WatchPR, interactive shell sessions and Workflow. Exactly-once notifications, cancellation, resource limits, offline/reconnect/restart and permission replay must be designed together.
6. **P2:** Worktrees and artifacts with explicit ownership, branch/cleanup approval and UI/storage design.
7. **Dependency blocker:** Code 0.34.1 / SDK 0.8.27 upgrade remains unresolved in Cowork; old coherent pins retained. Completing it does not register absent tools or prove parity.

Guide-required integration gates still open: organization-default plus two named connections concurrently; run-step effective model on normal/tool/compaction turns; mod install/reload/cleanup/approvals with current release; actual remote reconnection and final channel delivery. Unit/build successes cannot replace these gates.

## Audit receipt

- Source/AST inventory and historical tool-definition comparison: verified, no tool execution.
- Pure synthetic frontmatter validation: verified against actual upstream validator.
- Implementation samples reviewed for missing tools, async receipts, Task, Bash, CWD, memory credentials, image adaptation, TaskUpdate and patch path guards.
- This audit is a prioritized contract comparison, not a line-by-line proof for all 738 changed files or live runtime conformance.
- Changed only audit/migration documentation in this follow-up. No live mutations, implementation fixes, commits, pushes or deployment performed.
