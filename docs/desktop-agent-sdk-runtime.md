# Desktop Agent SDK execution

## Current architecture

Electron main runs **Letta Agent SDK 0.8.50 with Letta Code 0.34.20**, using a private native App Server's **API harness**. The SDK owns model turns, tool continuations, streaming and native retry policy. There is no custom REST/SSE model pump or legacy execution fallback.

`libs/runner/session-manager.ts` selects the SDK adapter; `libs/runner/sdk/session.ts` supplies Cowork's UI/tool lifecycle. Chat, continuation and existing background callers continue through `runLetta`. Task/Agent use a protected parent capability to create another SDK session; the delegated manager supplies policy, not another model loop.

The SDK's `backend: 'remote'` means its authenticated **loopback App Server transport**, not a selection of a Vera Remote computer. The native server's provider backend is `api`. Existing tool-specific local/remote execution selection remains authoritative.

## Scope and credentials

- Resource identity includes provider, authenticated account/workspace, explicit organization-default or selected Letta connection, and canonical conversation/agent. A different model/account or process-global active session is never a recovery target.
- A private child HOME contains non-secret settings only. The child receives a restricted environment, an ephemeral relay key and `ELECTRON_RUN_AS_NODE=1`; provider credentials and rotating Vera tokens remain in Electron main.
- The fixed-origin, authenticated HTTP relay pins connection headers, checks actor continuity before/after requests, bounds request bodies at 32 MiB and refuses redirects/path escapes. It does not expose a general proxy to the renderer.
- SDK callbacks supply the existing Cowork tools. Native built-ins are disabled. Per-session names prevent dispatch collisions/interactive-tool filtering; canonical names remain in descriptions and UI events.
- User permission modes and grants stay in Cowork's existing policy. SDK transport permissions are not business authorization. Approval updates are preserved. Plan mode is enforced again immediately before effects.
- A repeated tool-call ID returns its receipt; changed input cannot execute a second effect. A shared callback scheduler preserves file-write contention across independently arriving RPCs and child work.

## Memory, skills and tools

Native sessions use SDK **`stateless: true`**: agents/conversations remain persistent in the API, but native MemFS, mods and reflection do not compete with Cowork's existing scoped memory service. Read-only repository metadata discovery can still occur. This does not mean the agent forgets its persisted API memory.

The existing primary/shared checkout access, AgentMemory tool, memory dialog, scoped Skill roots, dirty work and credential invalidation remain in use. No checkout, shared mount or governance file is reset, moved or automatically committed/pushed by this migration. See [scoped memory behavior](agent-memory-runtime.md).

Cowork tools retain trusted agent/conversation/account/CWD context, runtime secrets, patches, extensions and explicit remote routing. Children cannot recursively call Task/Agent or widen their parent's tool subset. Different-agent children do not inherit the parent's secret environment. Existing blocking-only Task behavior and its concurrency/time limits remain.

## Progressive renderer updates

Typed SDK assistant deltas are accumulated once in a per-conversation draft store. Chat views subscribe with `useSyncExternalStore`; publication is batched at50ms without replacing Zustand's global sessions tree for every token. The main chat and embedded conversation viewer use the same snapshot, including when mounted mid-turn. OTID lineage preserves chunks across fallback UUID changes without merging distinct API runs. Final results commit canonical text once and clear transient publication/timers.

Regression fixtures: `test/assistant-live-draft.test.ts`, the existing render-churn test, and `test/assistant-streaming-fixture.html` served by local Vite. The browser fixture exercises the actual hook/message component before any final result, without authentication or live model calls.

## Completion and cancellation

Completion requires a native terminal receipt correlated to this logical input, terminal readback for its observed API run IDs, settled local callbacks/children and stable ownership. `requires_approval`, SDK reader EOF, UI removal and an expired timeout are not success or stop proof.

Cancellation blocks new local effects, waits for pending input/context work, sends native abort commands for correlated run IDs, verifies backend/tool/child settlement, and verifies native process-group teardown before releasing ownership. The native API backend currently uses the agent messages-cancel endpoint with an explicit `run_ids` body; the relay validates that every ID belongs to this execution and rejects broad cancellation. New model submissions after stop are denied.

Failed stop/readback retains the control path and can be retried. Unverified execution/cleanup keeps the conversation fenced; it is not replayed, relabelled completed or silently handed to another account. Loss of the control path or unresolved process cleanup can require reconciliation rather than a forced reset. Normal successors may await cleanup only after prior execution is already verified terminal.

The UI result callback is observational: it never sends a direct REST recovery message or claims an orphan approval was cleared. App quit waits for owned SDK cleanup; a failed verification pauses graceful quit.

## Native boundaries

- **SDK timeout distinction (verified 2026-10-23):** `LettaAgentClient.requestTimeoutMs` also arms the complete model-turn timer in SDK0.8.50, including tool/human waits. Do not set it to the 10-second handshake deadline. Production leaves that turn deadline unset; individual probe/control requests retain explicit bounded deadlines. A 12-second native fixture reproduces the previous failure and passes with this separation.
- The UI reconnect/recovery endpoint only replays live approval cards. It never auto-approves/cancels backend runs or emits a false idle state. SDK failures retain their original diagnostic if execution settlement cannot be verified.

- Native external callbacks are inline (`auto_background=false`) with a 300-second native timeout. A longer requested host-tool timeout cannot extend that native ceiling; cancellation remains subject to actual tool/process settlement.
- Native provider retries are SDK behavior, not an application replay loop. Tests verify terminal errors remain errors and are not treated as a resumable stream tail.
- Secret retrieval and shared resources still require existing server authorization; SDK installation grants no resource access.
- The seven retired WS/SSE engine files and old pump-specific tests are removed. Live plan helpers and terminal-reason classification were retained outside the retired directory. A build step prunes only their named stale generated artifacts.

## Packaging and validation

Electron Builder includes SDK/Code/search dependencies, unpacks executable assets, and unpacks Sharp's worker-side JavaScript/native dependencies. Unpacking only the `.node` files is insufficient: the separate native image worker must resolve `sharp`, `@img`, `detect-libc` and `semver` outside ASAR.

Relevant checks:

```sh
bun run transpile:electron
node --test test/*.mjs
bun test test/*.test.ts
bun run build
bun run lint
```

Native fixtures use only isolated local API servers/profiles. They exercise installed SDK execution, human approval/denial/correction, plan mode, vision, delegation, exact-run cancellation, receipt deduplication, retry/fencing and Electron-as-Node launch. Packaged tests can select a private validation bundle with `COWORK_SDK_TEST_PACKAGED_CLI` and `COWORK_SDK_TEST_PACKAGED_SDK`; they do not install or release it.

A macOS arm64 unsigned validation bundle is not Windows/Linux validation, a deployment, a live-provider/remote-machine test or human acceptance. Preserve those distinctions in delivery receipts. Existing worktree changes are not part of a commit unless explicitly reviewed and authorized.
