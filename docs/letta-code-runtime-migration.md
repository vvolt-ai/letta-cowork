# Letta Code Runtime Migration Notes

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
