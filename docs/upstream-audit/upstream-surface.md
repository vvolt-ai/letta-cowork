# Upstream `letta-code` Surface — what v0.25.10 ships

This is a flat inventory of every subsystem upstream exposes under `src/`. Use this as the reference when you're asking *"does upstream have X yet?"*.

For our coverage of each subsystem, see [`merged-vs-missing.md`](./merged-vs-missing.md).

## Top-level layout

```
letta-code/src/
├── agent/                 — agent loop, message construction, memory
├── auth/                  — OAuth + API-key providers (Anthropic, OpenAI, etc.)
├── backend/               — local + API backend (LocalStore, conversations, search)
├── channels/              — channel plugins (Slack, Telegram, Discord, transcription)
├── cli/                   — CLI app, commands, components, hooks
├── cron/                  — scheduler (cronFile, parseInterval, scheduler)
├── experiments/           — feature-flag manager
├── helpers/               — misc utilities
├── hooks/                 — user-configurable shell hooks on tool events
├── integration-tests/     — integration tests
├── lsp/                   — LSP client/manager for ReadLSP tool
├── permissions/           — approval system, rule matching, denial reasons
├── providers/             — model providers (BYOK, Codex)
├── queue/                 — request + turn queue runtime
├── ralph/                 — continuous autonomous loop mode
├── reminders/             — reminder engine + catalog + plan-mode reminders
├── skills/                — built-in skills (12 of them in this version)
├── telemetry/             — telemetry
├── tests/                 — test suites (mirror of src/ subsystems)
├── tools/                 — client tools (impl + descriptions + schemas)
├── types/                 — TypeScript types
├── updater/               — auto-update logic for desktop app + CLI
├── utils/                 — utilities
├── web/                   — web bridge for remote access
└── websocket/             — listener for `letta -p` headless + remote channel hosts

Top-level files of note:
├── constants.ts           — shared constants
├── headless.ts            — 144KB! the `letta -p` headless-mode entrypoint
├── index.ts               — 84KB main entrypoint
├── models.json            — 45KB model registry
├── settings-manager.ts    — 63KB settings system
├── settings.ts            — settings types
├── streamJsonWriter.ts    — NDJSON output formatter
├── runtime-context.ts     — runtime context helpers
└── version.ts             — version() helper (reads from package.json)
```

## Subsystem detail

### `agent/` — the spine

Files (40):
- `client.ts`, `index.ts` — agent client + entry
- `bootstrap-tools.ts`, `bootstrapHandler.ts` — startup
- `approval-execution.ts`, `approval-recovery.ts`, `approval-result-normalization.ts`, `check-approval.ts` — approval machinery
- `clone.ts`, `create.ts`, `import.ts`, `export.ts`, `modify.ts` — agent lifecycle
- `context.ts`, `maxContext.ts` — context management
- `memory.ts`, `memoryConstants.ts`, `memoryFilesystem.ts`, `memoryGit.ts`, `memoryRuntime.ts`, `memoryScanner.ts` — memory system (six files!)
- `message.ts`, `listMessagesHandler.ts`, `listMessagesRouting.ts` — message handling
- `model.ts`, `available-models.ts`, `defaults.ts` — model selection
- `personality.ts`, `promptAssets.ts`, `prompts/` — system prompts
- `reconcileExistingAgentState.ts`, `resolve-startup-agent.ts`, `sessionHistory.ts` — state reconciliation
- `skills.ts`, `clientSkills.ts`, `skillSources.ts` — skill loading
- `stats.ts` — usage stats
- `subagents/` — Task tool / subagent dispatch
- `turn-recovery-policy.ts` — recovery policy
- `github-utils.ts`, `http-headers.ts` — misc

Subagents (`agent/subagents/builtin/`): `fork.md`, `general-purpose.md`, `history-analyzer.md`, `init.md`, `init_local_memfs.md`, `memory.md`, `memory_local_memfs.md`, `recall.md`, `reflection.md`, `reflection_local_memfs.md`.

Prompts (`agent/prompts/`): `letta.md`, `letta_local_memfs.md`, `letta_no_memfs.md`, persona variants, memory + plan-mode reminders, onboarding, `recall_subagent.md`, `remember.md`, `skill_creator_mode.md`, `sleeptime.md`, source-specific (`source_claude.md`, `source_codex.md`, `source_gemini.md`).

### `tools/` — client tools

| Stream | Files |
|---|---|
| `tools/impl/` | 40 TypeScript files — actual tool runners |
| `tools/descriptions/` | 43 `.md` files — prompts/descriptions the agent sees |
| `tools/schemas/` | 43 `.json` files — JSON Schemas for tool arguments |

Tool list (alphabetical, only the "letta_v1" canonical ones — Gemini/Codex variants are alternate-provider re-skins):

`ApplyPatch`, `AskUserQuestion`, `Bash`, `BashOutput`, `CreateGoal`, `CreateWorktree` *(new)*, `Edit`, `EnterPlanMode`, `ExitPlanMode`, `GetGoal`, `Glob`, `Grep`, `KillBash`, `LS`, `Memory`, `MemoryApplyPatch`, `MessageChannel` *(new)*, `MultiEdit`, `Read`, `ReadLSP`, `Shell`, `ShellCommand`, `Skill`, `Task`, `TaskOutput`, `TaskStop`, `TodoWrite`, `UpdateGoal` *(desc-only)*, `UpdatePlan` *(desc-only)*, `ViewImage`, `Write`.

Provider-skinned variants in `tools/`: `GlobGemini`, `GrepFiles`, `ListDirCodex`, `ListDirectoryGemini`, `ReadFileCodex`, `ReadFileGemini`, `ReadManyFilesGemini`, `ReplaceGemini`, `RunShellCommandGemini`, `SearchFileContentGemini`, `WriteFileGemini`, `WriteTodosGemini`. These exist to expose the same tool to a Gemini-style or Codex-style model with that model's expected tool naming. **We don't need these** — our agents use the letta_v1 schema.

Tooling shared infra: `overflow.ts`, `process_manager.ts`, `shellEnv.ts`, `shellLaunchers.ts`, `shellRunner.ts`, `skillContentRegistry.ts`.

### `channels/` — channel plugins

This is the **plugin system** that lets upstream load user-defined channel adapters from `~/.letta/channels/<channel-id>/`. First-party bundled: Slack, Telegram, Discord. The README explicitly names WhatsApp as a plugin example.

- Top-level: `accountConfig.ts`, `accounts.ts`, `commands.ts`, `config.ts`, `inboundDebounce.ts`, `interactive.ts`, `messageTool.ts`, `pairing.ts`, `pendingControlRequests.ts`, `pluginRegistry.ts`, `pluginTypes.ts`, `registry.ts`, `routing.ts`, `runtimeDeps.ts`, `schemaConfig.ts`, `service.ts`, `targets.ts`, `types.ts`, `xml.ts`.
- Per-channel folders: `slack/`, `telegram/`, `discord/`, `custom/`, `transcription/`. Each has `accountConfig.ts`, `adapter.ts`, `media.ts`, `messageActions.ts`, `plugin.ts`, `runtime.ts`, `setup.ts`.
- `transcription/` is voice-message transcription (Whisper-style).

### `cron/` — scheduler

Tiny (4 files): `cronFile.ts`, `parseInterval.ts`, `scheduler.ts`, `index.ts`. Reads cron specs from a file and runs them.

### `backend/` — local + API backend

This is the data layer: LocalStore (SQLite-style persistence), conversation/message storage, API endpoints. Subfolders: `api/`, `dev/`, `local/`. Includes `LocalBackend.ts`, `LocalMessageProjection.ts`, `LocalStore.ts`, `LocalProviderAuthStore.ts`, `compaction.ts`, `transcriptMigration.ts`, `messageSearch.ts`. Also a `memfs-git-proxy.ts`.

### `permissions/` — approval system

Files: `analyzer.ts`, `canonical.ts`, `checker.ts`, `cli.ts`, `crossAgentGuard.ts`, `formatDenial.ts`, `loader.ts`, `matcher.ts`, `memoryDenialReason.ts`, `memoryScope.ts`, `mode.ts`, `readOnlyShell.ts`, `rule-normalization.ts`, `session.ts`, `shell-command-normalization.ts`, `shellAnalysis.ts`, `types.ts`.

This is what governs "Bash on /tmp/* allowed", "Edit on **/*.env denied", etc.

### `skills/builtin/` — built-in skills

12 skills shipped: `acquiring-skills`, `configuring-your-harness`, `context_doctor`, `converting-mcps-to-skills`, `creating-skills`, `dispatching-coding-agents`, `finding-agents`, `initializing-memory`, `messaging-agents`, `migrating-memory`, `scheduling-tasks`, `syncing-memory-filesystem`.

These are loaded as agents' commands via the `/<skill>` shorthand.

### `ralph/` — continuous mode

Single file: `mode.ts`. Toggles long-running autonomous loops.

### `reminders/` — reminder engine

Files: `catalog.ts`, `engine.ts`, `listenContext.ts`, `planModeReminder.ts`, `state.ts`. Injects scheduled reminders into the agent's context.

### `lsp/` — Language Server Protocol

`client.ts`, `manager.ts`, `types.ts`, `servers/` directory. Drives the `ReadLSP` tool: spins up LSP servers (e.g., tsserver, pyright) and queries them for diagnostics + symbol info.

### `hooks/` — user-configurable hooks

`executor.ts`, `loader.ts`, `prompt-executor.ts`, `types.ts`, `writer.ts`, `index.ts`. Users can attach shell commands to tool events ("before Bash" / "after Edit") via settings.

### `queue/` — request queueing

`queueRuntime.ts`, `turnQueueRuntime.ts`. Two queueing layers: per-request and per-turn.

### `websocket/` — listener

NOT the WsSession we ported. This is the **headless remote-listener** for `letta -p` and remote-channel-hosted agents.

Files: `listen-client.ts`, `listen-log.ts`, `listen-register.ts`, `terminalHandler.ts`. Plus `listener/` directory with the actual listener loop and `cwd-change.ts`.

### `experiments/` — feature flags

`manager.ts`, `types.ts`. Lightweight feature-flag toggling.

### `providers/` — model providers

`byok-providers.ts`, `openai-codex-provider.ts`. Tiny — most provider logic is upstream in the Letta server itself.

### `auth/` — OAuth + API key setup

`oauth.ts`, `openai-oauth.ts`, `setup.ts`, `setup-ui.tsx`. Setup wizards for users to connect their Anthropic/OpenAI/etc. accounts.

### Not relevant for our forks

- `cli/` — CLI rendering (we have our own Electron UI / NestJS server)
- `updater/` — auto-update (n/a for our packaging)
- `startup-auto-update.ts`, `startup-docker-check.ts` — same
- `web/` — web bridge (we proxy through our own backend)
- `release-notes.ts` — CLI display
- `tests/`, `integration-tests/` — tests
