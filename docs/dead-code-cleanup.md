# Conservative dead-code cleanup

Source/date: local source/import inventory and build/runtime fixtures, 2026-10-26. Classification: internal engineering. Scope: current standalone Cowork application; pending own-audit work is not part of this cleanup.

## Removed

The review inventoried364 application source modules from the renderer entrypoint, Electron main and preload, resolving TypeScript imports/re-exports and literal worker/module paths.55 files were unreachable. Runtime string entrypoints, tests, scripts, extension manifests and packaging references were checked before selecting removals.

- **45 renderer files:** unwired channel setup/settings prototypes, old event-card/timeline/permission/reasoning/tool-list views, unused email sidebar/list/preview fragments, an unused terminal panel/hook, migration row and barrel wrappers. The current channel creation, conversation viewer, email inbox and settings implementations remain.
- **7 Electron modules:** the superseded monolithic session handler, unused email server client/Letta proxy/PDF converter, unregistered legacy Express Odoo handlers and two empty deprecated filesystem/skill-sync modules. Active session IPC, registered HTTP routes, attachment/PDF handling and current tool registry remain.
- **Private unused helpers:** placeholder channel factories/normalizers, the superseded local history mapper, unused runner sender allocations/import and an unused tool-name set. The active history normalizer, permission callback and stream sender remain.

No dependencies, SDK versions, public IPC channel names, tool permissions, credentials, user profiles, saved sessions or remote routing policies were changed. Removing a dormant file is not removing a working route/feature: its current replacement or entrypoint was preserved and tested.

## Deliberately retained

The remaining309 application modules are still reachable. Three statically unreferenced compatibility surfaces remain: `ipc/types.ts`, `services/extensions/extension-types.ts`, and documented `services/remote-access/remoteAccessSettings.ts`. Static non-use is insufficient proof to remove externally consumed types/helpers. The dynamic extension loader, preload APIs, manual scripts, tests, skills and mod entrypoints are not judged dead from the app import graph.

Unused callback parameters and long-lived promise/session references were not mechanically removed: positional contracts, getter side effects and object lifetime can matter even when a TypeScript unused diagnostic is emitted. This review is not a claim that every possible unused export is safe to delete.

## Build/runtime safeguards

`tsc` does not delete emitted JavaScript for deleted source. `scripts/prune-retired-runtime.mjs` therefore prunes only the seven named retired module outputs/maps, retains source-existence refusal and build-path symlink guards, and never clears a user profile or arbitrary directory. New cleanup tests cover restored-source refusal, linked output directories, active entrypoints and absence of obsolete outputs. CI runs these contracts after transpilation.

## Verification

- Renderer and Electron TypeScript compile; production UI build succeeds.
- All production JavaScript chunks match the pre-cleanup build after normalizing only generated asset hashes. CSS dropped approximately9KB of obsolete Tailwind utilities/theme defaults; removed selectors/defaults were reviewed against remaining asset literals/runtime style usage. This is not a blanket byte-identical CSS claim.
-158 Node and18 Bun tests pass.11 actual Electron45 SDK fixtures pass and11 repeat from the signed macOS ARM64 package, including scoped tools, approvals, denial/plan, vision, slow turns and cancellation.
- Sandboxed preload/contextBridge/IPC fixture and strict packaged signature checks pass. The seven retired Electron artifacts are absent inside the final ASAR, not merely absent from source.
- Lint of changed files passes. Full lint remains blocked by five existing errors in untouched mod identity tests, redaction regex and pending own-audit files; no global lint autofix was performed.

No live account/provider/email/ERP/remote-machine execution or actual OS-login acceptance was performed. Windows/Linux physical execution and live app restart remain separate acceptance checks. No branch change, commit, push or deployment is implied by local validation.
