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

## macOS damaged-app diagnosis (2026-10-23)

Bhavesh's downloaded Cowork app and the local CI-mode build both failed read-only codesign/spctl with `code has no resources but signature indicates they must be present`: Electron linker signature, Identifier=Electron, Info.plist not bound, no resource seal. A successful DMG build/checksum did NOT prove app signature integrity. Configure mac.identity="-" and notarize=false for a complete ad-hoc bundle seal without credentials; keep default hardened runtime/Electron entitlements. New local build passes deep/strict codesign, has Identifier=com.vera.cowork with4612 sealed resources, DMG checksum valid, and Electron-as-Node smoke passed. Gatekeeper/spctl STILL rejects ad-hoc/unnotarized app: integrity is distinct from Apple trust; do not promise warning-free launch or silently remove quarantine/disable Gatekeeper. CI must run scripts/verify-macos-bundle.mjs and hdiutil verify before upload. Skip macOS artifact generation on PRs rather than overriding electron-builder's PR signing safeguard; Windows/Linux PR validation remains. Fresh hosted artifacts must pass the same integrity gate; ad-hoc signing does not establish Gatekeeper acceptance or notarization.
