# App-update notifications

Bhavesh selected the Vera-managed release feed on2026-10-26. Cowork checks approved app releases, shows **New version available** with **Download update / Later**, and offers **Settings → App updates → Check for updates**. It does not automatically download, execute an installer, restart Cowork or interrupt an active session.

## Behavior

- Packaged apps check30 seconds after startup, on the authenticated UI mount, then every6 hours. Development builds check only on explicit manual requests. Concurrent checks are coalesced; manual retries have a30-second cooldown.
- Later snoozes that release for24 hours in the local app profile. Newer versions are not suppressed; a manual check can show the snoozed release again.
- Main-process checks pin the existing Vera origin, user and organization. Late results from a previous account/origin are discarded. Pending download approval is cleared on scope changes. No Vera or GitHub token is passed to the renderer or browser URL.
- Download accepts a version identifier, never a renderer-supplied URL. It rechecks the feed immediately and refuses a changed/revoked version or changed installer checksum before opening the approved HTTPS location in the user's browser. No binary is automatically fetched or executed.
- The display model contains bounded plain-text notes, platform/architecture, installer format and the publisher-provided SHA-256. The app displays the checksum but **does not claim to verify a downloaded file**.
- A missing/older/unconfigured Vera feed is reported distinctly from “up to date.” Errors do not trigger logout, model calls or retries against another server. Update requests have a10-second abort deadline and a32KiB response ceiling; redirects are refused.
- IPC requires the owned live main frame and the existing trusted UI frame validator. Preload exposes only check/status/dismiss/version-bound download operations. No agent tool is registered for updates. Sandboxing, Node integration and context isolation are not weakened.
- The notification sits below settings/dialog overlays and away from the existing bottom-right session notifications.

## Release setup is still required

The authoritative feed schema and operator checklist live in `ai-platform/services/vera-cowork-server/docs/desktop-updates.md`. Vera provides authenticated `GET /desktop-updates/latest`; approved release metadata is configured with `VERA_DESKTOP_RELEASE_CATALOG` and exact `VERA_DESKTOP_DOWNLOAD_HOSTS` through deployment configuration. There is no user/agent publication API.

The current build workflow produces14-day GitHub artifacts, not automatically published installer releases. A human release process must bump the **app version**, publish durable platform installers, verify checksums and configure the catalog. No new version, download host, catalog, release upload or server deployment is created by adding this feature. Apps built before the checker need one manual upgrade to receive later notifications.

## Validation

Synthetic tests cover numeric stable-version comparison, platform/OS selection, allowlisted URLs, metadata limits, JWT endpoint restriction, snoozing, in-flight deduplication, account-switch races, downgrade rejection and explicit version-bound download. Real sandboxed Electron preload/IPC is exercised by `test/desktop-update-ipc-smoke.cjs` with fake feed/URL opening and an isolated profile. `test/desktop-updates.fixture.html` renders the actual notification/settings components with mocked IPC, never live accounts or downloads.

Live configured release delivery, real downloads/installs, Windows/Linux execution, OS notification permissions and production rollout are separate states. This feature uses an in-app notice, not a native OS notification requiring new permissions.
