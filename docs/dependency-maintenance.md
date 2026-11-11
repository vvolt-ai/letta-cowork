# Dependency maintenance

## 2026-11-11 local upgrade

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
