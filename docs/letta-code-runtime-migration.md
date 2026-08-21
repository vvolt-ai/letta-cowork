# Letta Code Runtime Migration Notes

## 2026-08-21 — Letta Code v0.30.28+ migration plan

- **Status:** Planning only. Upstream was pulled and reviewed; no Cowork runtime source was ported in this pass.
- **Upstream source:** `letta-ai/letta-code` `main` commit `db60f05f` (`v0.30.28-5-gdb60f05f`)
- **Latest release tag:** `v0.30.28` / `597f8b00`
- **Previous Cowork migration baseline:** `a8a3f8a0` (`v0.28.15` was `635631ff`)
- **Local pull performed:** `0c608d4f` → `db60f05f`
- **Review range:** 300 upstream commits from `a8a3f8a0..db60f05f`

### Scope and migration rule

Cowork is an Electron runtime using the Letta conversations API, not a source fork of the Letta Code CLI/listener. Port behavior and tests, not upstream file structure. Keep account, model, approval, and run identity conversation-scoped; do not add process-global state while adapting upstream code.

The working tree already contains the in-progress multi-account/model picker changes. Migration implementation must be split into separate reviewable commits and must not overwrite or silently absorb those changes.

### Existing Cowork parity to retain and revalidate

These behaviors already exist locally and should receive regression tests rather than a second implementation:

- terminal SSE EOF protection in `WsSession` via `stream-terminal-eof-guard` (upstream `91352d42`);
- total client-tool return clamping before model delivery;
- runtime-secret redaction at model, persistence, and trace boundaries;
- private bounded background output files and process/task retention limits;
- deleted-working-directory fallback, managed `ripgrep` resolution, required `Bash.description`, and improved patch context diagnostics;
- conversation-scoped model overrides and agent-model inheritance for Task subagents;
- strict permission mode and per-session approval state.

### Planned migration order

#### P0.1 — Account/model truth and resume refresh

Adapt upstream model carryover and resume work (`66d122af`, `97d1c170`, `65b7a3ae`, `e7514b7e`) to Cowork's API-driven session path.

Deliverables:

1. Treat organization-default as an explicit account scope internally; never let an empty connection selection inherit the New Conversation draft account or a previously selected client.
2. Log the non-secret account scope, requested model, server-confirmed conversation model, run ID, and step model handle at each turn boundary.
3. After creating, opening, or resuming a conversation, retrieve/verify the effective conversation model without replacing provider-specific output limits or model settings.
4. Keep the selected account/model immutable for an in-flight turn. A UI switch affects only the next/new conversation.
5. Add switch-away/switch-back tests covering organization-default plus two named connections, overlapping background runs, model catalogs, history, continuation, and compaction/recompile state.

Primary Cowork surfaces:

- `src/electron/services/letta-runtime/index.ts`
- `src/electron/ipc/handlers/session/*`
- `src/electron/libs/runner/ws/session.ts`
- `src/ui/store/useAppStore.ts`
- `src/ui/features/chat/components/PromptInput/*`

#### P0.2 — Turn recovery and stream ownership

Adapt behavior from upstream dropped-stream and safe-shutdown recovery (`c651c5b9`, `44cdd77b`) while preserving Cowork's existing busy-run wait and terminal EOF guard.

Deliverables:

1. Retry only when the active server run can be identified and resumed safely.
2. Never submit a duplicate user message after an accepted run.
3. Correlate `clientRunId`, Letta `run_id`, conversation owner, tool approvals, and terminal events.
4. Bound busy-run waits and expose actionable status instead of appearing indefinitely stuck.
5. Add tests for terminal SSE without transport EOF, transient provider shutdown, conversation-busy conflicts, cancellation, and approval continuations.

#### P0.3 — Safe direct client-tool ports

Review and port the small upstream hardening changes to both Cowork and Vera Server copies in the same implementation batch:

- reject duplicate resolved paths in one `ApplyPatch` request (`1fbf0035`);
- contain background-output write failures without crashing the owning run (`47e7d807`);
- verify braced `${NAME}` runtime-secret expansion and redaction (`d6f12df8`);
- preserve image content returned by external/client tools where Cowork's renderer and Letta SDK support it (`9b7f4609`);
- retain total return clamping and secret-safe overflow files (`b5fd4ce3`, `e1677b09`) with parity tests.

Do not copy upstream `Read` formatting blindly (`dad86b34`); Cowork history/tool rendering has its own line-number contract. Add a compatibility test first.

#### P1.1 — Task/subagent contract parity

Review upstream Task changes (`a6603c75`, `c0a387c9`, `bb329261`, `4f4864e3`, `acd1d3d7`).

Plan:

- keep the existing rule that Task cannot override its target agent model;
- ensure forked/general-purpose subagents inherit the intended parent toolset without reintroducing stale Claude-derived tools;
- align Task CRUD update validation with current upstream schemas where compatible;
- decide background Task support separately. Do not change Cowork's current synchronous Task behavior merely because upstream defaults differ;
- if background Task is enabled later, deliver completion notifications exactly once and keep TaskOutput/TaskStop ownership explicit.

#### P1.2 — Runtime working directory

Evaluate `SetWorkingDirectory` and runtime-CWD behavior (`4663d434`, `1263f94d`) as one feature rather than adding only a schema.

Required design:

- CWD is scoped to the active runtime session/turn, never process-global;
- validate and normalize paths cross-platform;
- update skill discovery and all local tools consistently;
- preserve deleted-CWD fallback;
- define how CWD changes are persisted across conversation resume and remote execution.

#### P1.3 — Vera mod compatibility

Validate `mods/letta-code-vera` against v0.30.28 before raising its engine floor.

Compatibility checks:

- approval-first turn input ordering (`9d8fb8d6`);
- cleanup of registrations during in-flight `/reload` (`83f4f1f7`);
- user-only notifications (`33aa7fef`);
- conversation title handles/events (`4f57796c`);
- mod-provided provider/environment composition (`64e177d8`);
- no conflict with upstream per-agent MCP OAuth (`3c414cfd`); Vera credentials must remain behind Vera's server/mod boundary.

Update the mod engine requirement only after install, reload, command, tool, auth-reuse, approval, and cleanup tests pass on the current Letta Code release.

#### P2 — Listener/channel architecture candidates

Do not copy the upstream listener or first-party Slack/Telegram/Discord implementations into Electron. Extract applicable contracts and tests for:

- exact run-to-send correlation and queue-boundary status (`3850ebd3`, `dbe6cbb9`);
- final lifecycle completion before outward delivery (`2c7de14a`);
- duplicate outbound action suppression (`6248f2b4`);
- channel-created conversation model pinning (`65b7a3ae`);
- interactive control request coordination (`fe3c26d3`);
- normalized message references, sender/thread metadata, and safe handoff semantics.

Vera Server remains the channel authority; Cowork should consume explicit event metadata rather than importing provider adapters.

### Explicitly not planned as direct ports

- CLI/TUI components, provider selectors, teleport command UX, Docker/CI watcher code, and first-party channel adapters;
- upstream app-server/listener transport wholesale;
- upstream Cloud/local backend implementation internals;
- process-global working-directory or model state;
- automatic background Task behavior without Cowork-specific ownership and notification design;
- upstream credential storage in place of Vera authentication.

### Validation gates for implementation

1. Add focused unit tests before each safe port.
2. Run related Cowork tests after every batch.
3. Run `bun run transpile:electron`.
4. Run `bun run build` and restore generated `dist-react/index.html` unless release output is explicitly requested.
5. Exercise organization-default plus at least two named Letta connections with concurrent conversations.
6. Verify exact `/v1/runs/{run_id}/steps` model handles for normal turns, tool continuations, and compaction.
7. Validate the Vera mod with `bun test ./src ./mods` and `bun --check mods/vera.js` against Letta Code v0.30.28+.
8. Record each implemented batch here with commit references, files, tests, and intentionally deferred work.

## 2026-07-27 — Task subagents inherit the agent model

Cowork no longer exposes or accepts a per-Task `model` override. Every subagent conversation uses the model configured on its target agent, and message requests never include `override_model`. This prevents model-generated Task arguments from silently changing the agent's configured model.

## 2026-07-22 — Letta Code v0.28.15+ review

**Upstream source:** `letta-ai/letta-code` `main` commit `a8a3f8a0` (latest tag pulled: `v0.28.15` / `635631ff`)  
**Previous local reference:** v0.27.27+ migration notes / commit `f414ef28`  
**Local target:** `letta-cowork` Electron runtime on branch `main`

### What was pulled upstream

Local `letta-code` was fast-forwarded from `f414ef28` to `a8a3f8a0`. The upstream range includes tags `v0.27.28` through `v0.28.15` plus post-tag `main` commits.

Notable upstream areas reviewed:

- Tool/schema hardening:
  - make shell `description` required across toolsets;
  - recover from deleted working directories;
  - improve patch context-mismatch diagnostics.
- Subagent/headless reliability:
  - refactor subagent launcher/model/stream parsing;
  - retry clear stdout-loss/truncated-stream cases in upstream headless subprocess mode;
  - emit subagent conversation IDs in state snapshots.
- Listener/runtime changes:
  - centralize turn lifecycle ownership;
  - publish authoritative executing tool IDs on loop state;
  - preserve OAuth credentials across listener reconnects;
  - repair stale conversation working directories;
  - handle stale approval resync in upstream headless mode.
- Mods and skills:
  - load agent-scoped MemFS mods;
  - avoid eager React dependency resolution in packaged runtimes;
  - remove skill invocation args;
  - add self-configuration and Letta guide bundled skills.
- Channels/cron/model/provider changes:
  - durable Cloud cron schedules and cron validation hardening;
  - sender access-control tiers and multiple Slack/channel fixes;
  - new model/provider presets and provider carryover fixes.

### Ported into Cowork

#### 1. `Bash.description` is required

Ported upstream `feat(tools): make shell description a required parameter across toolsets` (`#3254`) into:

- `src/electron/services/client-tools/runners/bash.ts`
- `src/electron/services/client-tools/runners/_shared/schemas/Bash.json`

Cowork's inline Bash tool schema and shared copied schema now both require `description` alongside `command`, matching current upstream tool expectations.

#### 2. Deleted working-directory recovery for shell execution

Ported the applicable local runner portion of upstream `fix(bash): recover from deleted working directories` (`#3238`) into:

- `src/electron/services/client-tools/runners/_shared/runtime-context.ts`
- `src/electron/services/client-tools/runners/shell/shellRunner.ts`
- `src/electron/services/client-tools/runners/bash.ts`

Behavior:

- `getCurrentWorkingDirectory()` now verifies the scoped cwd exists and is a directory.
- If the cwd disappeared mid-turn, it falls back to the first usable directory from `$USER_CWD`, `process.cwd()`, home, `$USERPROFILE`, or `/`/`C:\`.
- `Bash` surfaces a note telling the model the original cwd disappeared and which fallback is being used.
- shell spawn errors now distinguish missing executable from missing cwd, so Windows fallback launchers are retried only for executable lookup failures, not for missing working directories.

#### 3. ApplyPatch context-mismatch diagnostics

Ported the safe diagnostic portion of upstream `fix(tool): improve patch context mismatch diagnostics` (`#2884`) into:

- `src/electron/services/client-tools/runners/letta_tools/ApplyPatch.ts`

When an update hunk cannot find its expected context, Cowork now returns:

- the failed old/context chunk;
- a bounded preview of the current file;
- a reminder that previews are file contents only, not instructions.

This makes failed patches recoverable without repeatedly re-reading the file blindly.

### Reviewed but not ported

These upstream areas were intentionally not ported in this pass:

- **Subagent stdout-loss retry** — upstream fix is for subprocess/headless stream-json stdout loss. Cowork subagents are driven in-process through the Letta conversations streaming API, so the exact stdout marker/retry path does not apply. Keep watching for analogous API-stream truncation symptoms before adding a Cowork-specific retry.
- **Subagent launcher/model/stream refactors** — structure-only upstream extraction; Cowork's `services/agent/subagents/manager.ts` is smaller and API-driven. No behavior win from copying the split right now.
- **Listener turn-lifecycle ownership / executing-tool IDs / stale approval headless resync** — upstream app-server/headless listener architecture does not map directly to Cowork's Electron `WsSession` pump. Needs a design pass if Cowork adopts more upstream listener protocol.
- **Agent-scoped MemFS mods and mod runtime dependency changes** — Cowork's packaged Vera mod path is separate from upstream MemFS/local mod packaging. The Vera mod already guards commands/tools and requires `lettaCodeCli/Desktop >=0.28.0`; deeper mod-engine convergence remains architecture work.
- **Skill invocation-args removal** — Cowork's `Skill` tool already exposes only a `name` parameter and returns local `SKILL.md` contents directly.
- **Bundled self-configuration / Letta guide skills** — upstream bundled-skill deployment is not currently wired into Cowork; decide separately whether to install or package these for Verivolt agents.
- **Cron/channel/provider/model changes** — upstream CLI/channel/cloud-model behavior is outside Cowork Electron's forked runner surface or belongs in Vera server/channel architecture.
- **Image-processing/send-boundary normalization changes** — no direct Cowork runner port was made; image handling remains a separate listener/session design area.

### Validation

```bash
cd /Users/niralsakariya/Desktop/vv/new/letta-cowork
bun run transpile:electron
```

Result: passed.

### Future migration checklist additions

- Add a small regression test for Bash deleted-cwd fallback once the client-tool runner has a stable unit-test harness.
- Revisit upstream stale-approval/headless resync only if Cowork's Electron session approval state shows repeat stale-approval failures.
- Revisit mod-engine convergence separately from the Vera mod package, especially agent-scoped mod loading and packaged-runtime dependencies.

## 2026-07-07 — Letta Code v0.27.27+ review

**Upstream source:** `letta-ai/letta-code` `main` commit `f414ef28` (latest tag pulled: `v0.27.27` / `99707e63`)
**Previous local reference:** v0.27.20 migration notes / commit `31293df3`
**Local target:** `letta-cowork` Electron runtime on branch `vera-remote-access`

### What was pulled upstream

Local `letta-code` was fast-forwarded from `31293df3` to `f414ef28`. The upstream range includes tags `v0.27.21` through `v0.27.27` plus one post-tag `main` commit.

Notable upstream areas reviewed:

- MemFS/listener hardening:
  - make MemFS mandatory upstream and centralize startup enablement;
  - include image assets in `list_memory` responses;
  - send a stable `listenerInstanceId` when registering environments;
  - await MemFS push before emitting `memory_updated` / write-delete responses;
  - isolate reflection MemFS writes in worktrees.
- Listener/runtime protocol changes:
  - app-server approval control requests;
  - environment registration and headless-message routing through environments;
  - acting-user echo on listener conversation create/fork;
  - listener protocol ergonomics and recovery updates.
- Tooling changes:
  - remove built-in `CreateGoal` / `GetGoal` / `UpdateGoal` goal mode;
  - add optional `description` to upstream `ExecCommand`;
  - default upstream `Task` subagents to background execution;
  - update `Task.run_in_background` schema wording.
- Sandbox/subagent changes:
  - make cross-agent shell sandbox opt-in while keeping memory-subagent sandbox default-on;
  - subagent sandbox and parent-id propagation fixes.
- CLI/channel/provider changes:
  - `letta dream` / `letta dream --to`;
  - skill-name frontmatter enforcement and MemFS sync after skill install;
  - Slack media/thread fixes;
  - model/favorites/provider UX changes.

### Ported into Cowork

No direct code ports were applied in this pass.

Reason: the new upstream changes were either already covered by Cowork-specific runtime design, not present in the forked Electron runtime, or too broad to port safely without a separate design pass. Cowork does not currently carry upstream `ExecCommand`, built-in goal tools, upstream first-party Slack/Telegram/Discord adapters, upstream local-backend MemFS control flow, or the upstream app-server listener command set.

### Reviewed but not ported

These upstream areas were intentionally not ported in this pass:

- **MemFS mandatory/startup changes** — Cowork's runtime uses its own Electron/remote-runner memory projection path; upstream local-backend flags do not map 1:1.
- **MemFS write/push ordering in upstream listener commands** — Cowork's Electron WS runner does not implement the upstream `memory_updated` command flow.
- **Memory worktree reflection isolation** — important future candidate, but it is a large subagent/reflection architecture change and needs a dedicated Cowork design pass.
- **Stable `listenerInstanceId` environment registration and headless environment routing** — upstream app-server/environment protocol is not currently implemented in Cowork's Electron runner.
- **App-server approval control requests** — no matching approval-control plumbing exists in Cowork's current runner.
- **Goal tool removal** — Cowork does not expose the removed upstream `CreateGoal`, `GetGoal`, or `UpdateGoal` tools.
- **`ExecCommand.description`** — Cowork does not expose upstream `ExecCommand`; its `Bash` tool already has a required user-facing `description` field.
- **Upstream `Task` default-background change** — not ported because Cowork's `Task` implementation is intentionally synchronous and returns an explicit error when `run_in_background` is requested.
- **Cross-agent shell sandbox opt-in/default changes** — Cowork shell execution has separate Electron/runner boundaries; this should not be copied piecemeal.
- **Skill frontmatter enforcement / skill MemFS install sync** — no matching Cowork skill installer surface was found in the Electron runtime.
- **Slack/Telegram/Discord channel fixes** — upstream first-party channel adapters are not part of Cowork's forked runtime surface.
- **Model/favorites/provider/CLI UX changes** — upstream CLI-only behavior, not relevant to Cowork Electron runtime migration.

### Validation

```bash
cd /Users/niralsakariya/Desktop/vv/new/letta-cowork
bun run build
```

Result: not run in this pass because the repository already contains unrelated local changes outside the migration note. No Cowork source code was changed.

### Future migration checklist additions

- Revisit memory-worktree reflection isolation if Cowork enables autonomous reflection/background subagents.
- Revisit upstream environment registration/headless routing only if Cowork adopts the upstream app-server environment protocol.
- Keep Cowork `Task` schema/description aligned with its synchronous implementation rather than blindly following upstream's background-default wording.

## 2026-07-01 — Letta Code v0.27.20 review

**Upstream source:** `letta-ai/letta-code` `v0.27.20` / commit `31293df3`
**Previous local reference:** v0.27.4 migration notes
**Local target:** `letta-cowork` Electron runtime on branch `vera-remote-access`

### What was pulled upstream

Local `letta-code` was fast-forwarded from `cc14e2cf` to `31293df3`. The upstream range includes large new systems around mods, sandboxing, app-server protocol, worktrees, artifacts, and provider UX.

### Ported into Cowork

#### 1. File path expansion for core file tools

Ported upstream `expandFilePath` behavior into Cowork client tools:

- `Read`
- `Write`
- `Edit`
- `MultiEdit`

Supported forms now resolve before file access:

- `~/path`
- `$VAR/path`
- `${VAR}/path`
- relative paths against the tool runtime cwd

Implementation:

- Added `src/electron/services/client-tools/runners/_shared/filePath.ts`
- Updated the four tools above to use `expandFilePath(file_path, userCwd)`

#### 2. `AskUserQuestion.multiSelect` is optional

Upstream made `multiSelect` optional while keeping default `false` in the schema. Cowork now matches that behavior:

- `src/electron/services/client-tools/runners/letta_tools/AskUserQuestion.ts`
- `src/electron/services/client-tools/runners/_shared/schemas/AskUserQuestion.json`

This prevents avoidable validation failures when an agent omits `multiSelect` for single-choice questions.

#### 3. WS listener half-open socket reaping

Ported the applicable part of upstream `fix(listener): reap half-open sockets on both listener transports` (`#3143`) into Cowork's cloud listener:

- `src/electron/libs/runner/ws/listener.ts`

Behavior:

- Tracks the last relay `pong` after app-level `{ type: "ping" }` heartbeats.
- Terminates the socket if no relay `pong` is seen for 90 seconds.
- Lets the existing `close` handler run the reconnect path instead of leaving a half-open zombie listener.
- Calls `unref()` on the heartbeat interval so it does not keep the process alive by itself.

This targets laptop sleep, network switches, and NAT idle timeouts where TCP can become half-open without emitting `close`.

#### 4. Managed `ripgrep` resolution for `Grep` / `Glob`

Ported the safe local portion of upstream `fix(tools): manage ripgrep resolution` into:

- `src/electron/services/client-tools/runners/_shared/ripgrepManager.ts`
- `src/electron/services/client-tools/runners/letta_tools/Grep.ts`
- `src/electron/services/client-tools/runners/letta_tools/Glob.ts`

Behavior:

- Resolves `rg` at call time instead of freezing a possibly-bad bundled path at module load.
- Prefers `$LETTA_CODE_TOOLS_DIR/rg` or `$HOME/.letta/bin/rg` when present.
- Falls back to system `rg`.
- Uses bundled `@vscode/ripgrep` only if it exists and passes `rg --version`.

This directly addresses packaged Electron failures like `Grep failed: spawn ENOTDIR` from `app.asar` paths.

Note: upstream can auto-download managed tools; Cowork currently does not auto-download and instead reports a clear install/configuration error.

#### 5. Private background output logs

Ported upstream background-output hardening into:

- `src/electron/services/client-tools/runners/_shared/process_manager.ts`

Behavior:

- Uses a per-process private temp directory when `LETTA_SCRATCHPAD` is not set.
- Creates background output files with `0600` permissions.
- Avoids shared fixed `/tmp/letta-background` log collisions across users/runs.

### Reviewed but not ported

These upstream areas were intentionally not ported in this pass:

- Full mods/package learning harness
- Kernel/seatbelt/bwrap sandbox system
- `EnterWorktree` replacement for upstream `CreateWorktree`
- Artifact file tools experiment
- Native app-server protocol management commands
- Full upstream app-server listener implementation. Cowork does not carry that server-side transport; the analogous Vera remote-runner server watchdog was patched in `vera-cowork-server`.
- Upstream shell/subagent filesystem sandboxing. This needs a deliberate Cowork integration pass because the Electron runner already has custom local execution boundaries.
- Upstream automatic managed-tool downloading. Cowork now supports managed/system/bundled `rg` resolution but does not download binaries itself.
- CLI/provider-selector UX changes
- Slack/Telegram/Discord first-party channel changes

Reason: they are either CLI/desktop upstream features not wired into Cowork yet, or broad systems that need a separate design pass before being merged into the forked runtime.

### Validation

```bash
cd /Users/niralsakariya/Desktop/vv/new/letta-cowork
bun run build
```

Result: passed.

### Future migration checklist

When pulling a newer `letta-code`:

1. Pull upstream `letta-code` and note the tag/commit range.
2. Diff only the forked runtime surfaces first:
   - `src/tools/impl/*`
   - `src/tools/schemas/*`
   - `src/tools/descriptions/*`
   - `src/websocket/listener/*`
   - `src/agent/subagents/*`
   - `src/permissions/*`
3. Classify changes as:
   - safe direct port,
   - architecture/system port requiring design,
   - upstream-only/not applicable.
4. Apply safe ports to both Cowork and Vera server runtimes when both carry the same tool.
5. Build Cowork and Vera server.
6. Update this file and the Vera server migration note with the upstream commit and validation result.
