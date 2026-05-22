# Upstream `letta-code` Audit

**Upstream:** [`letta-ai/letta-code`](https://github.com/letta-ai/letta-code) — the canonical "memory-first coding agent" CLI/desktop app that our two forks descended from.

**This folder answers two questions:**

1. **What have we merged from upstream into our forks?** (What works, what's intentionally divergent.)
2. **What's missing that we'd benefit from?** (What upstream has built that we haven't ported yet.)

## Our two forks

| Repo | Path | Role | Relationship to upstream |
|---|---|---|---|
| `letta-cowork` | Standalone Electron app | Desktop chat client over Letta | Custom UI on top of upstream's runner spine |
| `vera-cowork-server` | `ai-platform/services/vera-cowork-server` (NestJS) | Server-side runtime: channel bridges (WhatsApp/Slack/Telegram/Discord/Email), scheduler, agent runtime, memfs | Ports cowork's runner into a server; channels + scheduler built independently |

The chain:

```
upstream letta-code  →  letta-cowork (Electron) runner  →  vera-cowork-server letta-runtime
                                                              ↘ vera-cowork-server channels (independent)
                                                              ↘ vera-cowork-server scheduler (independent)
```

## Pinned versions at time of audit

| Source | Version / commit |
|---|---|
| Upstream `letta-code` | **v0.25.10** (HEAD `1640c914` — "fix(channels): render Telegram block quotes #2296") |
| Audit date | 2026-05-19 |

## Documents in this folder

| File | Purpose |
|---|---|
| `README.md` (this file) | Index, methodology, how to re-run |
| `upstream-surface.md` | Full inventory of upstream `src/` — every subsystem and what it does |
| `merged-vs-missing.md` | Subsystem-by-subsystem: status in cowork vs vera-server, gap recommendations |
| `tools-inventory.md` | File-level diff of client tools across all three trees |
| `changelog.md` | Record of what we've actually shipped to close gaps. Update after every Phase. |

## Methodology

1. **Pin upstream**: `cd letta-code && git pull && git describe --tags`. This audit reflects v0.25.10.
2. **Inventory upstream**: walk `src/` top-down. Each subdirectory is a subsystem.
3. **Map our forks**: for each upstream subsystem, find the equivalent in cowork (`src/electron/libs/runner/`, `src/electron/services/client-tools/`) and vera-server (`src/letta-runtime/`, `src/channels/`, `src/scheduler/`).
4. **Classify each subsystem**:
   - **Merged & current** — present and reasonably synced
   - **Merged but stale** — present but upstream has moved
   - **Partial** — some files ported, gaps in others
   - **Missing** — never ported, candidate for merge
   - **Intentionally divergent** — we chose not to port (with reason)
   - **Built independently** — we shipped before upstream did; convergence decision needed
5. **For each tool**: cross-check `tools/impl/`, `tools/descriptions/`, `tools/schemas/` against our `letta_tools/` directories.

## How to re-run this audit

When upstream churns enough to warrant a refresh:

```bash
# 1. Pull upstream
cd ~/Desktop/vv/new/letta-code && git pull
git describe --tags  # note the new version

# 2. Re-run the inventory scripts (see docs/upstream-audit/scripts/ — TBD)
# OR re-run by hand:
cd src && find . -maxdepth 2 -type d | sort
ls tools/impl tools/descriptions tools/schemas

# 3. Diff our trees
cd ~/Desktop/vv/new/letta-cowork
find src/electron/libs/runner src/electron/services/client-tools -name "*.ts"

cd ~/Desktop/vv/new/ai-platform/services/vera-cowork-server
find src/letta-runtime src/channels src/scheduler -name "*.ts"

# 4. Update the per-subsystem tables in merged-vs-missing.md and tools-inventory.md
```

## What this audit is NOT

- **Not a line-by-line diff.** Where a file exists in both upstream and our fork, we don't compare its contents in this doc — that's a Phase-2 deep-dive done per subsystem when we decide to converge it.
- **Not a verdict on every gap.** Some upstream subsystems intentionally don't apply to us (CLI, updater, web). Others (skills, ralph) are real opportunities. The audit calls these out but doesn't force a decision.
- **Not a one-time exercise.** Upstream pushes daily. Plan to re-run quarterly or before any major version bump.
