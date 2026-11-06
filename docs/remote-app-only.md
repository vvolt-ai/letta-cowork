# Remote-only Cowork build

`REMOTE_APP_ONLY=true` builds a dedicated home shell with only **Profile** and **Remote Access**. The default (`false` or unset) preserves the complete Cowork app. This is a build-time variant, not a toggle in saved settings or a launch-time environment override.

## GitHub Actions

After this workflow change is published:

1. Open **Actions → Build Electron App → Run workflow**.
2. Select the intended branch and check **remote_app_only**.
3. Run the workflow. Windows, Linux and macOS Apple Silicon inherit the same flag.
4. Download `windows-build-remote-only`, `linux-build-remote-only` or `macos-arm64-build-remote-only`.

Unchecked/manual full builds and normal push/PR builds remain full Cowork. Full/remote manual runs have distinct concurrency groups. Existing build-only permissions, PR/signing safeguards and `--publish never` stay intact; no release credentials or automatic GitHub Release is added.

Installer product name, application ID and data directory remain Vera Cowork. These variants are not separate side-by-side installations; artifact suffix and the visible **Remote-only app** badge distinguish this build. Safely quit an existing full-app instance before launching the remote variant: the unchanged single-instance lock otherwise focuses the already-running app. A remote-only app is not silently redirected to the full app's update UI.

## Local builds

POSIX shell:

```sh
REMOTE_APP_ONLY=true bun run build
REMOTE_APP_ONLY=true bun run dist:win
# Or dist:linux / dist:mac-arm64 on a supported build host.
```

PowerShell (restore the prior shell setting afterwards):

```powershell
$previous = $env:REMOTE_APP_ONLY
try {
    $env:REMOTE_APP_ONLY = 'true'
    bun run dist:win
} finally {
    $env:REMOTE_APP_ONLY = $previous
}
```

The flag is also supported in Vite's normal `.env`/mode-specific files. Explicit build-process environment wins. Only literal `true`/`false` are accepted; invalid values fail the build. Development Electron transpilation uses the development env mode, matching the Vite dev server. Use the same flag for both halves of `bun run dev`.

Use `REMOTE_APP_ONLY=false bun run build` to return to the normal local build. Rebuild/reload the app deliberately; changing a variable after an installer was built cannot change that installed variant.

## Implementation and scope

- `scripts/app-build-mode.mjs` resolves the flag for both build halves. Vite bakes the renderer constant, and the Electron transpilation pipeline writes versioned `dist-electron/build-mode.json`. Packaged `dist-electron` includes that metadata. Main rejects missing/corrupt metadata instead of silently broadening a remote build.
- `App` selects a separate `RemoteOnlyApp` before mounting any full-app hooks. It does not mount chat, session restoration/recovery, email polling, schedules, administration, skills or ordinary settings navigation. Old full-app view state and unsupported URL fragments cannot open those views.
- Profile editing/phone verification, login, logout, organization selection and the existing remote runner configuration remain. API Server configuration is available on the existing login screen. Account changes remount the scoped panel; successful organization switching reloads it.
- Remote-only startup skips the local email HTTP server, channel bridge autostart and local scheduler initialization (including auth-triggered initialization). Stored schedules/settings/history are not deleted; the full build retains its existing behavior. Backend/server schedules are not modified.
- Remote-host startup, authentication, directory grants, saved opt-in, auto-approval preference and authorized tool execution remain unchanged. The flag does **not** automatically enable remote access, approve tools, add shares, copy credentials or remove server/native permission checks. Trusted remote-tool extensions and tools remain available under their existing policy.
- This is a product/UI/startup variant, **not a security sandbox or removal of tool implementations from the binary**. It is not an authorization boundary for a modified renderer or authorized remote requests.

## Validation

Both full and remote-only TypeScript/Vite builds and build/workflow contracts pass locally. The full regression receipt is337 Node/native tests (323 supported embedded-Node fixtures plus14 ordinary-Node unit fixtures),65 Bun UI tests, and0 scoped lint errors (warnings remain). No repository-local Prettier executable is installed; TypeScript formatting was used for the new TS files without rewriting unrelated source. UI tests cover only the two feature links and coercion of unsupported sections. The localhost browser fixture uses synthetic authenticated data with a super-admin role and stale administration URL, exercises both pages, and makes no live API/model/mailbox/host request.

Fixture: start Vite with `REMOTE_APP_ONLY=true`, then open `test/remote-app-only.fixture.html`. Never use a production token or real remote enable/save/profile action for this fixture. Generated build output and browser artifacts are not source changes. Real GitHub Actions runs, platform installers, signing, installation and remote-provider acceptance remain separate delivery/validation states.
