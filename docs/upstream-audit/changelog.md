# Audit Changelog — gap closures

Records what we've actually shipped to close upstream gaps identified in the audit. New entries at the top.

---

## 2026-05-19 — Phase 1 starter

**Pinned at:** upstream `letta-code@v0.25.10` (HEAD `1640c914`)

### ✅ Stale documentation fixed

- `vera-cowork-server/src/letta-runtime/ws-session.ts` header comment used to say "No subagent/Task path" — that was wrong since Task tools were registered as part of the subagent parallelism work. Updated to reflect current reality (subagents ARE present; only LSP + AskUserQuestion remain intentionally absent).

### ✅ 4 built-in skills installed

Copied from `letta-code/src/skills/builtin/` (MIT) into `~/.letta/skills/` where our skill runner already searches:

| Skill | Lines | What it does |
|---|---|---|
| `messaging-agents` | 146 | Send messages to other agents on the Letta server via the conversations API |
| `scheduling-tasks` | 201 | Schedule reminders + recurring tasks via the `letta cron` CLI |
| `syncing-memory-filesystem` | 277 | Git-backed memory repo workflows (sync, conflict resolution, remote setup) |
| `creating-skills` | 370 | Guide for authoring new SKILL.md files |

**How to use:** Any agent can now call `Skill({ name: "messaging-agents" })` and receive the workflow.

**Caveats:**
- Install is **user-local** (Bhavesh's machine only). Other team members need to install separately, or we need to decide on a deployment path (commit to a shared repo, package in vera-server, etc.).
- Our skill runner returns the full SKILL.md body inline. Upstream's runner uses a `queueSkillContent` registry that injects content on the next turn — slightly more efficient for huge skills. Functional difference is small.

### ❌ Did NOT ship

The following were considered for Phase 1 but rejected on closer inspection:

- **`Memory` / `MemoryApplyPatch` tools** — too large (1.4K lines combined), requires porting upstream's whole memory subsystem first.
- **`MessageChannel` tool** — requires deciding on channels convergence (path a/b/c in `merged-vs-missing.md`). Phase 2.
- **`CreateWorktree` tool** — pulls in upstream's `websocket/listener/*` model, which we don't have. Phase 2.
- **`EnterPlanMode` / `ExitPlanMode`** — small (134 lines combined) but need a `permissions/mode` shim, and without a UI consumer that reacts to plan-mode state, the value is hollow.
- **`CreateGoal` / `GetGoal` / `UpdateGoal`** — small but require `settings-manager` (63KB upstream singleton) and have no UI consumer for `remaining_tokens` yet.
- **`Shell` / `ShellCommand`** — duplicates `Bash` without plan-mode's escalation flag adding value.

---

## Future-state tracking

Use this section to plan upcoming closures. Move entries up to the dated changelog when shipped.

### Phase 2 candidates

- [ ] Port `Memory` + `MemoryApplyPatch` tools (requires memory subsystem port)
- [ ] Decide channels convergence path (a/b/c) — block on architectural call
- [ ] Add bundled-skill discovery to our skill runner (port subset of upstream's `agent/skills.ts`)
- [ ] Reminders engine (`reminders/{engine,catalog,planModeReminder}.ts`)

### Phase 3 candidates

- [ ] Hooks system (user-configurable tool hooks)
- [ ] Queue runtime (if turn-ordering bugs appear)
- [ ] Ralph mode (autonomous continuous loop)
- [ ] Remaining 8 built-in skills (decide team-wide deployment strategy first)
