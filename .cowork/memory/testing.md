# letta-cowork testing memory

**Last updated:** 2026-06-23

## Default validation

For Electron/client-tool/runtime changes:

```bash
bun run transpile:electron
bun run build
```

`transpile:electron` is the fastest first check for Electron main-process/client-tool changes.

## Common warnings that are currently non-blocking

- Vite detects `vite-tsconfig-paths`; Vite now supports native `resolve.tsconfigPaths`.
- `markdownRenderer.tsx` is dynamically and statically imported, causing an ineffective dynamic import warning.
- Some chunks exceed 500 kB after minification.

## Tool smoke-test pattern

After changing `src/electron/services/client-tools/runners/coding.ts`, validate compile first, then import from `dist-electron` and run a few tools against the repo:

- `ProjectDetect`
- `CodeFileOutline`
- `CodeSearch`
- `CodeGetDefinition`
- `CodeFindReferences`
- `CodeDiagnostics`

`CodeSearch` should work even when `rg` is unavailable because `coding.ts` includes a JS fallback search path.

## Commit safety

Before commit:

```bash
git status --short
git diff --cached --check
```

Stage only intended files. Known unrelated/dirty files may include `.gitattributes` and `dist-react/index.html`.

## Build-only CI publishing regression (2026-10-23)

Confirmed from GitHub run#83 (607f9e6) and Bhavesh's Linux log: Windows packaging/artifact upload passed; Linux installer packaging reached electron-builder's implicit CI publisher and failed for missing GH_TOKEN. Do not add a release secret to fix build-only CI. All four dist:* scripts must pass --publish never. test/ci-build-workflow.test.mjs validates actual builder CLI parsing and PublishManager.isPublish=false under CI=true without credentials, plus workflow safety/targets. See README GitHub automatic builds section for intended rollout and artifact names. Workflow adds readonly push/PR/manual builds, Bun1.3.9/Node24 frozen install, installer-only artifacts and macos-15 arm64 after Win/Linux success. Unsigned macOS DMG built locally in CI mode; actionlint,124 Node and18 Bun tests passed. Revised Windows/Linux/macOS GitHub execution needs a fresh successful run; source publication or a local macOS build alone does not prove hosted Linux/macOS success.
