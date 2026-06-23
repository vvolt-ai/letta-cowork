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
