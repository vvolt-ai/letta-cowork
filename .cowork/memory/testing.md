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
