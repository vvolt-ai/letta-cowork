# Letta Code Runtime Migration Notes

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
