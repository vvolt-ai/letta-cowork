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

## Own-user Vera database audit exposure (2026-10-23)

Bhavesh requested the existing server SafetyAuditListOwn reader be usable from Cowork. Added local tool backed only by protected current-session GET /safety-audit-events/me; see docs/own-safety-audit.md. No native MCP or backend changes. Reject user/org overrides, do not use admin fallback, bound body/time, and discard on active API object/user/org/server changes. Remote runner omits the tool and dispatcher rejects it to avoid borrowing remote-owner credentials. Compiled tool's live own-user read verified;137 Node+18 Bun tests and Electron/project TS/Vite builds passed; independent static review found no P0/P1. Rebuild/restart required to mount new catalog. Audit output still may omit stdout/stderr; do not advertise raw console or unrestricted database search. Bhavesh subsequently authorized committing/pushing the pending audit source together with discovery improvements. Deployment/restart remains separate.

## Electron45.1.0 / SDK0.8.55 verification (2026-10-28)

Exact trio Electron45.1.0 / SDK0.8.55 / Code0.34.26 is now engine-compatible (actual Electron Node24.22.1/ABI150/ARM64).190 Node+17 Bun tests,12 Electron-native and final12 packaged-path SDK fixtures pass; PTY/Sharp execute in dev and ASAR, isolated sandbox preload/IPC and strict com.vera.cowork ad-hoc resource seal pass. Initial cold parallel packaged cancellation was unverified; isolated and full parallel repeat passed without timeout/guard weakening; cause remains unestablished. Test-only packaged-path support extended to cancellation/delegation for truthful coverage. No new DMG, other-OS physical validation, live provider replay, app restart or release. UI/package validation stages under .letta/validation rather than overwriting the user's pending dist-react output. Keep source publication separate from loaded/live acceptance.
