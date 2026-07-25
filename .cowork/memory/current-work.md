# letta-cowork current work

**Last updated:** 2026-06-23

## Recently completed

- Added Cowork coding workflow tools and committed as `4828682 feat: add coding workflow tools`.
- Retested `bun run transpile:electron` and `bun run build` successfully after the commit.
- Smoke-tested compiled coding tools from `dist-electron`.

## Pending / likely next

1. Rich UI card for `LiveProposePatch` with diff rendering and accept/reject buttons.
2. `ToolTraceSearch` backed by structured tool-call logs.
3. Real LSP-backed `CodeGetDefinition` / `CodeFindReferences`; current implementation is fallback search because LSP manager is a stub.
4. `.cowork/project.md` bootstrapping command for repos that do not have memory yet.
5. Extend touched-file tracking to future `CodeEdit` / `CodeApplyPatch` wrappers if those are added.

## Repo status at creation time

After commit `4828682`, remaining dirty files were:

```text
M .gitattributes
M dist-react/index.html
```

These were intentionally not included in the coding-tools commit.

## 2026-07-25 built-in browser automation

- Added native Cowork client-tools backed by Playwright in `src/electron/services/client-tools/runners/browser.ts` and registered them from `src/electron/services/client-tools/index.ts`.
- Tools: `BrowserNavigate`, `BrowserSnapshot`, `BrowserClick`, `BrowserType`, `BrowserWaitFor`, `BrowserTakeScreenshot`, `BrowserConsoleMessages`, `BrowserNetworkRequests`, `BrowserClose`.
- Safety default: `BrowserNavigate` only allows localhost URLs unless the tool call passes `allowExternal: true` after explicit user approval.
- Added `playwright` dependency and installed Chromium locally with `bunx playwright install chromium` for this machine.
- Validation: `bun run transpile:electron` and `bun run build` passed. Build required removing deprecated `baseUrl` from `tsconfig.app.json` for TypeScript 7.

### Preview default update

- Updated `BrowserNavigate` / Playwright session creation to default to headed Chromium (`headless: false`) so Cowork users can see a live browser preview while the agent tests pages.
- Agents can still pass `headless: true` for background checks.
