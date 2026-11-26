# Dependency maintenance

## Applied compatible updates — 2026-11-26

Bun-owned package.json/bun.lock now include compatible updates: ws8.23.0 (direct pin/override aligned), Playwright1.65.1 (no browser installation), @types/node26.6.11, @types/react19.3.3, react-refresh lint plugin0.5.8, typescript-eslint8.74.0 and explicit Prettier3.10.1. Compatible fresh transitive resolution removed the reported Undici/brace-expansion/Hono high/low findings without forcing one major across their consumers. An interrupted partial lock needed re-resolution; final frozen Bun install passes without changes. No npm lock was introduced.

Fresh Bun audit: **2 moderate,0 high/critical/low** advisory records, remaining in glob/minimatch. The previous17-high/24-moderate/6-low record below is pre-update, not current. These remaining majors were not forced. Electron45.3.0/embedded Node24.22.2/ABI150, SDK0.8.90/Code0.34.63, TypeScript6.0.3 and its LSP alias remain exact; Electron45.5/Code0.34.71 and held framework/lint majors are not claimed adopted.

Validation: full TypeScript/Vite build staged outside the existing generated renderer; supported shell Node24.22.3 broad suite **412 pass,2 skip**; selected Electron-native dependency/PTy/Sharp/auth/isolation tests **25 pass**; renderer TSX tests **18 pass**; frozen Bun install passes. A monolithic all-tests run under Electron timed out and was not counted as passing; no remaining test process was observed. The mixed Bun TS/TSX invocation produced55 failures, dominated by absent browser localStorage in store helpers (38 pass); no unrelated persistence/test-harness refactor is included. Do not advertise all UI tests clean or infer exploitation/production acceptance from advisory counts. Native model/process fixtures use temporary data only; no app restart, installer, real provider/message/ERP action or live memory change occurred.

## Pre-update review — 2026-11-26

Source: current manifest/installed graph, read-only npm outdated (metadata comparison only), Bun audit and fresh registry peer/version queries. Bun remains the authoritative installer/lock owner. No npm lock was created; no packages, overrides, lockfiles or global runtimes were changed. Older install/test receipts below are historical, not validation of new candidates.

### Verified baseline and corrections

- Exact SDK **0.8.90**, Code **0.34.63**, Letta client **1.12.1** remain declared/installed. Fresh registry queries report SDK latest0.8.90 and Code latest **0.34.71**. The outdated command initially returned Code latest0.34.23, inconsistent with fresh `npm view ... --prefer-online` version/dist-tags. Never downgrade the verified pair to the older tag or blindly replace it from one outdated report.
- SDK0.8.90's Code peer interval is `>=0.34.60 <0.35.0`. Candidate0.34.71 fits that interval but still needs the pair's native-version/diagnostic patch and installed SDK tests; it is not adopted by this review.
- Actual Electron binary reports **45.3.0 / Node24.22.2 / ABI150 / darwin-arm64**. This establishes that local binary only, not a running packaged app or other OS. The shell Node **22.22.3** is below Code's `^22.23.4 || ^24.22.1 || ^26.12.1` requirement; use the supported embedded/project runtime for release checks rather than suppressing engines.
- Compiler and typescript-lsp alias remain **6.0.3**. Do not migrate just because registry latest is7.0.2.
- `format` and `format:check` invoke Prettier, but this desktop manifest has no direct Prettier dependency and no repository-local executable was found. Tooling repair is a separate candidate change; do not claim those formatting commands passed or silently download a formatter.

### Update candidates

| Dependency/group | Installed → registry candidate | Qualification |
|---|---|---|
| Electron | Exact45.3.0 → 45.5.0 | Outside exact pin; verify embedded Node/ABI, PTY/Sharp, packaging/signing and platform acceptance |
| ws | Exact8.22.2 → 8.23.0 | Direct dependency and override must stay aligned; transport regressions required |
| Playwright | 1.65.0 → 1.65.1 | Browser installation/download is not implicit |
| @types/node / @types/react | 26.6.6 → 26.6.11 / 19.3.0 → 19.3.3 | Types are not runtime upgrades |
| eslint-plugin-react-refresh | 0.5.7 → 0.5.8 | Check current lint configuration |
| typescript-eslint | 8.72.2 → 8.74.0 | Candidate still declares TypeScript `<6.1.0` |
| ESLint / @eslint/js | 9.39.5 → 10.15.0 / 10.0.1 | Held: eslint-plugin-import2.32.0 peers stop at ESLint9 |
| TypeScript / typescript-lsp | Exact6.0.3 → 7.0.2 | Held by current lint peers; update compiler and alias together only after a validated migration |

A candidate being semver-compatible is not proof it is safe to install. Keep Bun lock ownership, native-binary state, existing app data and the SDK pair intact until an approved upgrade/validation workstream. No application restart or installer release occurred in this review.

### Current security: unresolved high-priority transitive paths

Fresh `bun audit --json` reports **17 high, 24 moderate, 6 low, 0 critical** advisory records across `@hono/node-server`, `brace-expansion`, `glob`, `minimatch` and `undici`. The previous17-high/22-moderate/6-low receipt is historical; it must not be reused as a current audit. Advisory counts are not distinct package counts and are not directly comparable with npm's server vulnerability entries. Reachability/exploitability was not established by this review.

Representative installed paths, checked with a read-only installed dependency-tree query:

| Path | Installed affected versions |
|---|---|
| Code → pi-ai → OpenAI SDK → Undici | 6.28.0 |
| Slack Bolt → socket-mode → Undici | 7.29.0 |
| Discord/REST and WebSocket nested REST → Undici | 6.28.0 and6.24.1 |
| Electron download/rebuild toolchain → Undici | 7.29.0 and6.28.0 |
| Builder/ESLint/minimatch → brace-expansion | 1.1.12,1.1.18,2.0.2,2.1.4,5.0.9 across different branches |

Prioritize these paths before cosmetic latest-version updates. Reported Undici ranges include TLS-option propagation, redirects/cache disclosure and WebSocket/response denial-of-service issues. Newest reported fixes require appropriate **6.29.1 / 7.30.1** family versions; verify actual current advisories/upstream constraints before adopting any target. Brace-expansion fixes span distinct1.x/2.x/5.x branches. Never force a single Undici/brace-expansion major across incompatible consumers or assume a manifest override changed the installed graph. See representative advisories [Undici TLS options](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [Undici cross-origin redirects](https://github.com/advisories/GHSA-4w7w-5xrc-9h26), [brace recursion](https://github.com/advisories/GHSA-qhr7-859c-m2p7). Bun1.3.9's previously observed version-scoped override limitation remains a validation concern; it was not retested or fixed here.

Next approved work: resolve compatible upstream/parent updates or proven scoped overrides, verify exact installed paths and frozen Bun install, then run native ABI/PTY/Sharp, auth/context/tool-discovery, shared-server SDK and packaging tests under supported Node. Do not use an audit-fix force operation, fabricate a clean security status, install browsers, overwrite app settings or infer live adoption from changed source.

## 2026-11-16 paired SDK migration

Direct exact pins are now SDK0.8.90 / Code0.34.63; Bun lock and installed package/peer/handshake checks agree. The old latest-tag downgrade warning below is historical, not the current registry state. Code's required pi-ai1.5.2 brings its matching pi-schema/pi-telemetry and Anthropic SDK0.129.0 transitives; other desktop dependencies, Electron45.3.0 and TypeScript6.0.3 are unchanged. Full build,342 Node/native checks,68 Bun UI tests and frozen Bun install pass. No global runtime installation or live app activation. See [current runtime pair and MemFS-enabled backend rollout gate](desktop-agent-sdk-runtime.md).

## Historical 2026-11-11 dependency sweep

Bun is the authoritative package manager; package.json and bun.lock move together. No npm lockfile is generated. Existing Letta SDK0.8.81/Code0.34.51 and TypeScript6.0.3 are preserved. The registry's Code latest tag pointed to older0.34.23; do not downgrade the verified pair.

| Group | Previous | Updated |
|---|---|---|
| Electron | 45.1.0 / Node24.22.1 | 45.3.0 / Node24.22.2; ABI150 unchanged |
| electron-builder / app-builder-lib | 26.15.3 | 26.18.0, with exact matching dmg-builder/Squirrel peers |
| electron-store | 11.0.2 | 12.0.0 |
| dotenv | 17.4.2 | 18.0.10 |
| React / React DOM | 19.2.8 | 19.3.1 |
| Vite / React plugin | 8.2.1 / 6.0.5 | 8.3.8 / 6.3.0 |
| Tailwind / Vite plugin | 4.3.3 | 4.3.5 |
| Playwright | 1.62.1 | 1.65.0 |
| Zustand | 5.0.14 | 5.1.0 |
| WebSocket | 8.21.3 | 8.22.2, direct dependency and override aligned |

Other compatible updates include Radix, Discord/Slack libraries, Pino, type definitions, lint integration and development tooling. Reviewed electron-store12's Conf16/Node22 requirement and preserved defaults/location; no real app settings were opened. Dotenv18 retains explicit process-env precedence; its optional fast parser/CLI are not enabled. Native package lifecycle scripts were skipped except explicitly downloading the new Electron binary. No global Node/Bun/CLI installation or app restart.

### Security pins and remaining findings

Update stale overrides rather than assuming direct updates remove vulnerable transitives. Compatible pins updated for xmldom0.8.15, body-parser2.4.0, fast-uri3.1.9, ip-address10.7.6, js-yaml4.3.2, qs6.17.1, Sharp0.35.5 and ws8.22.2. Compatible single-major graph overrides also cover proxy-addr2.0.8, humanfs/node0.16.8, baseline-browser-mapping2.11.35, browserslist4.29.5, Hono4.13.18, music-metadata11.16.0 and Zod4.6.7.

Final Bun audit:0 critical,17 high,22 moderate,6 low advisories (not package counts). Remaining high reports are in multi-major brace-expansion/Undici chains. Moderate reports remain in Hono's Node server, glob and minimatch as well. Do not force one major across those graphs. The installed Bun1.3.9 silently retained versions when a version-scoped override was tested; unsupported/inert selector entries were removed. Any future scoped override must be proved against installed versions and frozen install, not merely its appearance in the lockfile. These findings still require follow-up; this is not a clean security audit.

### Deferred incompatible majors

- TypeScript7: current typescript-eslint8.72.2 supports TypeScript >=4.8.4 <6.1.0. Keep both compiler and typescript-lsp alias on6.0.3 pending migration.
- ESLint10/@eslint/js10: eslint-plugin-import2.32.0 declares support only through ESLint9. Preserve the supported9.39.5 pair rather than forcing peers.

### Validation / activation

Full Electron TypeScript/renderer build passes (output staged outside the repository to preserve existing generated HTML).342 Node/native checks pass:328 under actual Electron45.3.0's Node24.22.2 plus14 ordinary-Node process/shebang checks.68 Bun UI tests pass. test/dependency-data-compat.test.mjs checks synthetic legacy JSON retention, dotenv precedence, actual PTY execution and Sharp image processing. Frozen Bun installation passes and installer peer packages are aligned.

Tests use fake APIs, temporary files and synthetic settings. No actual agent memory, email/ERP operation, schedule, provider prompt, app reload, installer/ASAR rebuild, other-OS physical validation or production deployment was performed. Commit/push and activation remain separate authorizations.
