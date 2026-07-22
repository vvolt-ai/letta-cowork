# Agent Guide

## Scope

These instructions apply to the entire Vera Cowork repository. Vera Cowork is the
Electron + React desktop client for Letta Code agents. Keep this file concise and
current; use the linked project documents for deeper explanations.

## Start Here

1. Read `README.md` for setup and supported features.
2. Read `AGENT-README.md` and `project-feature.md` for architecture orientation.
3. Confirm current paths in `src/` before editing. Some older documentation still
   names files that have since moved into feature, service, or IPC subdirectories.
4. Inspect `git status` and preserve unrelated work. Do not commit or push unless
   the user explicitly asks.

## Architecture Map

```text
src/ui/                         React renderer
  features/                     Feature-owned UI and behavior
  hooks/                        Shared renderer hooks
  store/                        Zustand application state
  services/                     Renderer-side service wrappers

src/electron/                   Privileged Electron main process
  main/                         App lifecycle, windows, menu, tray
  ipc/handlers/                 Renderer/main IPC handlers
  api/                          Backend/API clients
  libs/runner/                  Letta streaming/session runtime
  services/                     Domain services and client tools
  bridges/                      Messaging-provider bridges
  emails/                       Zoho/local email integration

skills/                         Bundled agent skills
extensions/                     Trusted local runtime extensions
mods/letta-code-vera/           Separate Letta Code mod package
docs/                           Design and migration notes
```

The renderer is unprivileged. Filesystem, process, credential, native integration,
and Letta runtime work belongs in Electron and must be exposed through the preload
and IPC boundary. Do not import Electron-main modules into `src/ui/`.

## Common Commands

Use Bun for normal repository work; scripts and project documentation are written
for it. Do not regenerate both lockfiles as an incidental change.

```bash
bun install                    # install dependencies
bun run dev                    # Vite + Electron development mode
bun run transpile:electron     # validate Electron TypeScript only
bun run build                  # TypeScript project build + Vite bundle
bun run lint                   # lint without applying fixes
bun run lint:fix               # lint and apply fixes
bun run format:check           # verify formatting
bun run format                 # rewrite supported files with Prettier
bun run rebuild                # rebuild native Electron modules when needed
```

Packaging commands (`dist:mac-arm64`, `dist:mac-x64`, `dist:win`, and
`dist:linux`) are slower and platform-sensitive. Run them only when the change or
request requires a distributable.

The root package currently has no dedicated test script. For most source changes,
the minimum validation is the narrowest relevant check followed by:

```bash
bun run build
bun run lint
bun run format:check
```

The embedded mod is a separate package. Validate mod-only changes from its folder:

```bash
cd mods/letta-code-vera
bun test
bun --check mods/vera.js
```

## Implementation Conventions

- Prefer feature modules under `src/ui/features/` and domain services under
  `src/electron/services/` over adding new root-level files.
- Use the existing `@/*` alias for `src/*` where the surrounding code does.
- Follow the repository's TypeScript, ESLint, and Prettier configuration instead
  of introducing a local style.
- Keep IPC contracts explicit and serializable. Update preload types, handler
  registration, and renderer callers together.
- Keep one logical owner for persisted state. Do not let async refreshes overwrite
  newer user edits or terminal session state.
- Prefer non-blocking work and graceful partial failure for independent background
  operations. Use `Promise.allSettled()` when one failed item should not cancel the
  rest.
- Fix lifecycle races at their source. Do not hide approval, stream, history, or
  merge races with arbitrary sleeps.
- Preserve explicit channel metadata such as provider, channel/chat ID, thread,
  sender, conversation, agent, and policy context across boundaries.

## Runtime and Security Boundaries

- Never expose Letta keys, channel credentials, refresh tokens, or local token
  caches to renderer code, logs, fixtures, or commits.
- Trusted extensions execute in the Electron main process with local-machine
  access. They are disabled by default; preserve that trust boundary.
- Treat tool approvals as part of one logical user turn. A
  `requires_approval` stop can be an intermediate continuation, not completion.
- Client-tool results must keep their tool-call IDs and wire shapes intact. Review
  `src/electron/libs/runner/` and the relevant client-tool service before changing
  approval or continuation behavior.
- The packaged application has different path and native-module behavior from dev.
  Check `electron-builder.json`, `vite.config.ts`, and `src/electron/main/` for
  packaging-sensitive changes.
- Do not edit generated output in `dist-react/` or `dist-electron/` as the source of
  a fix.

## Important Flows

### Chat/session flow

```text
renderer feature/store
  -> preload + IPC
  -> Electron session runner
  -> Letta stream and client tools
  -> normalized SDK messages
  -> renderer state/history
```

For session changes, inspect both the outer logical-turn pump and the individual
stream-turn parser. Avoid emitting terminal UI state for intermediate tool or
approval stops.

### Backend and remote execution

Desktop backend calls live under `src/electron/api/`; remote environment and tool
execution logic lives under `src/electron/services/remote-access/` and related
runner/tool services. Keep local and server execution targets explicit rather than
falling back silently.

### Channels and email

Messaging bridges live under `src/electron/bridges/`; email integration lives under
`src/electron/emails/` and UI email features. Background sync is not a durable job
queue, so only mark work complete after its downstream agent operation succeeds.

## Documentation Coupling

- If a runtime/API contract changes, update the closest design or migration note.
- If a bundled skill depends on a changed endpoint or workflow, update that skill
  in the same work session.
- If a path in `AGENT-README.md` or `project-feature.md` is stale and relevant to
  the task, correct it rather than copying the stale path here.
