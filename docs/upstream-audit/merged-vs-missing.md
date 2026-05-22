# Merged vs Missing — subsystem audit

Per-subsystem status of our two forks against upstream `letta-code@v0.25.10`.

**Legend**

- ✅ **Merged & current** — present and reasonably synced
- 🟡 **Merged but stale** — present but upstream has moved meaningfully
- 🟠 **Partial** — some files ported, gaps in others
- ❌ **Missing** — never ported, candidate for merge
- 🔀 **Intentionally divergent** — we chose not to port (with reason)
- 🛠 **Built independently** — we shipped before upstream did; convergence decision needed
- ➖ **Not applicable** — doesn't fit our fork's role

## Master table

| Upstream subsystem | letta-cowork status | vera-cowork-server status | Notes / recommendation |
|---|---|---|---|
| `agent/` (loop, memory, approval) | 🟠 Partial — runner spine ported, no memoryGit/memoryRuntime | 🟠 Partial — ws-session.ts is the port; no memory* equivalents | The memory subsystem (memoryFilesystem/memoryGit/memoryRuntime/memoryScanner) is a real gap. Worth a Phase-2 deep-dive. |
| `agent/subagents/` | ✅ Merged — Task tool wired up | ✅ Merged — `subagents/manager.ts` + `parallelism.ts` (Bhavesh's recent work) | Current. |
| `agent/prompts/` (system prompts) | ❌ Missing — we use our own | ❌ Missing — same | We don't ship system prompts at the runner level; agents carry their own personas. Probably correct. |
| `tools/` (client tools) | 🟠 17/30 of upstream's canonical tools | 🟠 15/30 — minus AskUserQuestion, ReadLSP | See [`tools-inventory.md`](./tools-inventory.md). Real gaps: CreateWorktree, MessageChannel, Memory, MemoryApplyPatch, Goal tools, PlanMode tools. |
| `permissions/` | 🟠 Partial — runner has permission-handler.ts | 🟠 Partial — runs `permissionMode: "bypassPermissions"` | We auto-approve. Upstream has a proper rule engine. If we ever expose tool execution to less-trusted users, we'll need this. |
| `channels/` | ➖ N/A | 🛠 Built independently — `src/channels/` (WhatsApp, Slack, Telegram, Discord, Email) | **Big decision.** Upstream now has a plugin system (`~/.letta/channels/<id>/plugin.mjs`) that explicitly cites WhatsApp as an example use case. Three paths: (a) converge — adopt upstream's plugin contract, (b) diverge — keep ours, (c) contribute — upstream our WhatsApp + Email plugins. See "Channels convergence" below. |
| `cron/` | ➖ N/A | 🛠 Built independently — `src/scheduler/` | Compare upstream's cronFile/parseInterval against ours. Likely keep ours (we have UI integration), but worth a quick check of upstream's interval-parsing for edge cases. |
| `backend/` | ➖ N/A — Letta server handles persistence | 🛠 Built independently — TypeORM + Postgres | Upstream's `backend/local/` is SQLite-style local persistence for the CLI/desktop app's offline mode. We use the Letta server directly. Probably correct to skip. |
| `skills/builtin/` | 🟠 Partial — 4 of 12 installed to `~/.letta/skills/` (2026-05-19) | 🟠 Partial — same machine-local install | Installed: `messaging-agents`, `scheduling-tasks`, `syncing-memory-filesystem`, `creating-skills`. Remaining 8: `acquiring-skills` (already there), `configuring-your-harness`, `context_doctor`, `converting-mcps-to-skills`, `dispatching-coding-agents`, `finding-agents`, `initializing-memory`, `migrating-memory`. Note: install is user-local; if team-wide install needed, decide on a deployment path. |
| `ralph/` (continuous mode) | ❌ Missing | ❌ Missing | Could enable autonomous overnight runs. Low-priority but novel. |
| `reminders/` | ❌ Missing | ❌ Missing | Plan-mode reminders + memory-check reminders are quality features. Worth scoping. |
| `lsp/` | ✅ Merged — `client-tools/lsp/manager.ts` + ReadLSP tool | 🔀 Intentionally divergent — ws-session comment says "no LSP path" | vera-server doesn't run LSP servers. Code review confirms ReadLSP is not in vera-server's letta_tools/. Document this in the runner README. |
| `hooks/` | ❌ Missing | ❌ Missing | User-configurable tool hooks (e.g., "lint after every Edit"). Would be a nice-to-have for power users. |
| `queue/` | ❌ Missing | ❌ Missing | Request + turn queueing. We may be hitting bugs here that upstream's queue would solve. Worth investigating if we see ordering / interleaving issues. |
| `experiments/` | ❌ Missing | ❌ Missing | Feature flag manager. Low priority; we can ship our own when needed. |
| `auth/` | 🟠 Partial — we have our own auth (NestJS Passport) | 🟠 Partial — same | Upstream's auth is for connecting end-users to their Anthropic/OpenAI keys. We do this via vera-server. Likely keep diverged. |
| `providers/` | ❌ Missing | ❌ Missing | BYOK + Codex providers. Only matters if users wire their own non-Letta-server models. Skip. |
| `websocket/` (remote listener) | ❌ Missing | ❌ Missing | This is the `letta -p` headless-listener — what makes inter-agent comms work without a UI. We rely on the **upstream-installed** CLI for this (we run `letta -p` from shell). **Lock the version** of `@letta-ai/letta-code` we install globally; don't fork this. |
| `headless.ts` | ➖ Use upstream directly via npm | ➖ Use upstream directly via npm | Same as above. |
| `models.json` (45KB model registry) | ❌ Not synced | ❌ Not synced | Could be useful if we surface model choice in the UI. Currently the Letta server enumerates models for us. |
| `settings-manager.ts` (63KB) | 🟠 Partial — cowork has its own settings | 🟠 Partial — vera-server has its own config | Settings storage is one of those things every fork rewrites. Probably correct. |
| `telemetry/` | 🔀 Intentionally divergent — we don't ship telemetry | 🔀 Intentionally divergent — same | Stay diverged. |
| `cli/` | ➖ N/A — we have Electron UI | ➖ N/A — we have a server | Skip. |
| `updater/`, `startup-*.ts`, `web/` | ➖ N/A | ➖ N/A | Skip. |

## Stale documentation: vera-server's ws-session.ts header comment

```
// Differences from cowork:
//   • No subagent/Task path (no Task tool registered).
//   • No LSP path (no ReadLSP tool registered).
//   • No AskUserQuestion (no UI to ask through).
```

The "no subagent/Task path" claim is now wrong — `src/letta-runtime/subagents/manager.ts` and `parallelism.ts` exist and Task is wired up. Update this comment on the next touch.

Other two bullets (no LSP, no AskUserQuestion) are still accurate.

## Channels convergence — the big decision

Upstream's `channels/` (added recently) is structured as a **plugin system**:

- Bundled first-party: Slack, Telegram, Discord (and transcription).
- User plugins live at `~/.letta/channels/<id>/plugin.mjs` with a `channel.json` manifest.
- Upstream's README explicitly cites WhatsApp as an example user plugin.
- Plugins expose: inbound message handling, pairing/routing, and extend the shared `MessageChannel` tool that agents use to send outbound messages.

We built **WhatsApp + Email + our own Slack/Telegram/Discord bridges** in vera-server before upstream's plugin system existed. Now there's a clear interface to converge against.

**Three paths:**

| Path | What it means | When it's right |
|---|---|---|
| (a) **Converge** | Adopt upstream's `channels/` core in vera-server. Rewrite our bridges as plugins. | If we want to stay close to upstream and benefit from their continued investment in channels. |
| (b) **Diverge** | Keep our channels/ as-is. Document the divergence. | If our needs (multi-tenant, Postgres persistence, vera-server-only architecture) require server-side bridges that don't fit upstream's local-plugin model. |
| (c) **Contribute** | Upstream our WhatsApp + Email bridges as user plugins. | If our bridges are clean enough to publish and we want community visibility. |

**My read:** (b) for now, (c) opportunistically for WhatsApp. Our architecture is fundamentally server-side multi-tenant (Postgres, Neo4j conversation graph, JWT auth per channel). Upstream's plugins are designed for single-user local-host deployment. Forcing convergence would mean rewriting our channel runtime to fit a different lifecycle.

But: **steal upstream's plugin types and `messageTool.ts` design** — those are likely cleaner than ours, and the `MessageChannel` tool itself is a useful abstraction.

## Recommendations summarized

**High-leverage gaps to close:**

1. **Skills system** — ✅ **Partial done 2026-05-19.** 4 built-in skills installed via `~/.letta/skills/`. Remaining: port upstream's `agent/skills.ts`/`clientSkills.ts`/`skillSources.ts` machinery for bundled-skill discovery + frontmatter `allowed-tools`/`requires-init` support if we want feature parity.
2. **Memory tools** — port `Memory` and `MemoryApplyPatch` client tools. These let agents edit their own memory in-band rather than relying on the SDK alone. Large (1400 lines combined) and pulls in upstream's whole memory subsystem (`agent/memoryFilesystem`, `agent/memoryGit`, `backend/`).
3. **CreateWorktree tool** — just-landed upstream; useful for parallel work patterns. 448 lines, but deps on `websocket/listener/{runtime,cwd-change,worktree-watcher}` which we don't have — would need a runner-side adapter.
4. **MessageChannel tool** — even without converging the channel plugin system, the tool itself is the right abstraction for "agent sends to channel X". 878 lines, pulls in `channels/pluginRegistry` etc. — either port plugin infra OR write a vera-server-flavored adapter.

**Lower priority but worth scoping:**

5. **Reminders engine** — useful for plan-mode workflows
6. **Hooks system** — user-configurable lint/format/test on tool events
7. **Queue runtime** — investigate if our turn-ordering bugs would be solved by adopting this

**Watch-and-wait:**

8. **Ralph mode** — interesting but no clear use case yet
9. **LSP** — keep in cowork only; vera-server stays out

**Lock and don't fork:**

10. **`@letta-ai/letta-code` package** — we shell out to `letta -p` for inter-agent comms. Pin the version we install globally so upstream churn doesn't silently break us.
