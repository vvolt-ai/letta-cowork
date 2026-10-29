# Desktop Agent SDK execution

## Current architecture

Electron main runs **Letta Agent SDK 0.8.55 with Letta Code 0.34.26**, using a private native App Server's **API harness**. The SDK owns model turns, tool continuations, streaming and native retry policy. There is no custom REST/SSE model pump or legacy execution fallback.

`libs/runner/session-manager.ts` selects the SDK adapter; `libs/runner/sdk/session.ts` supplies Cowork's UI/tool lifecycle. Chat, continuation and existing background callers continue through `runLetta`. Task/Agent use a protected parent capability to create another SDK session; the delegated manager supplies policy, not another model loop.

The SDK's `backend: 'remote'` means its authenticated **loopback App Server transport**, not a selection of a Vera Remote computer. The native server's provider backend is `api`. Existing tool-specific local/remote execution selection remains authoritative.

## Electron runtime baseline

As of2026-10-28 the desktop is exact-pinned to Electron45.1.0 (embedded Node24.22.1, native ABI150). The pinned node-abi4.40.0 mapping and Bun-local rebuild command support that ABI. Removed login-item hidden-state fields are replaced with the macOS wasOpenedAtLogin signal plus the existing --hidden argument; Linux does not call unsupported login-item settings. Manual launches remain visible. macOS13 or later is now required; the supported installer targets remain64-bit.

The SDK/CLI pair is explicitly upgraded together to0.8.55/0.34.26. SDK0.8.55 requires Code>=0.34.26 <0.35.0; that CLI requires Node^22.23.4 || ^24.22.1 || ^26.12.1. Electron45.1.0 now meets the embedded Node floor that blocked45.0.0. The App Server handshake still rejects any CLI version other than the exact pin. Bun lock and runtime contracts verify the trio. No nightly Electron or global CLI/Node upgrade is used.

Current local verification used actual Electron45.1.0 against fixture APIs/private homes, including approvals, vision/slow turns, delegation and correlated cancellation.190 Node tests,17 Bun tests,12 actual-Electron native fixtures and12 final packaged SDK/CLI fixtures passed. An isolated sandboxed renderer tested real preload/contextBridge/IPC without app accounts/services/login items. PTY/Sharp executed from development and the validation ASAR. The isolated ad-hoc-signed macOS ARM64 .app passed deep/strict resource-seal verification; no new DMG or release was generated. One first cold parallel packaged cancellation returned SDK_NATIVE_TREE_CLEANUP_UNVERIFIED; isolated and final full parallel checks passed without weakening cleanup guards. Its initial cause is not established; do not treat that as a fixed cancellation race or live acceptance. Windows/Linux, real OS-login and live-provider acceptance remain separate. Ad-hoc integrity is not notarization/Gatekeeper trust.

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

## User-visible request failures

Startup/continuation/session failures must produce a visible notice, not only terminal output. Connection/server failures (including `conversation_retrieve` timeouts) show fixed guidance that the interruption may be temporary and suggest waiting about five minutes. The text does not promise recovery. Authentication, permissions, missing/mismatched agent/account/conversation, invalid model and unverified-stop failures use corrective guidance instead; an uncertain stop must not be replaced by advice to resend. Raw stacks, URLs, credential-bearing bodies and arbitrary quoted model names are not presentation text. Detailed diagnostics remain in runtime logs.

SDK cleanup can request abort after initialization fails; that is not proof the user selected Stop. Only the trusted stop callback or owning abort signal suppresses failure feedback. The failed initialization's owned cleanup settles before its IPC turn releases ownership, so an older terminal status cannot overtake a queued retry. A failure is displayed before potentially slow cleanup. Pre-initialize errors reject the awaited identity instead of leaving startup pending; no fake pending conversation is exposed.

The renderer retains terminal feedback across cleanup idle/completed statuses and history refresh, preserves failed optimistic prompts and the new-session draft, and clears it when the user explicitly starts another attempt. Pending approvals remain visible; their cancellation applies a pending terminal result rather than leaving the chat thinking. Error notices render independently of display status. Recoverable SDK/tool errors can show recovery feedback while work remains active. There is no automatic five-minute timer, resubmission or business-write retry; users must inspect already-completed actions before retrying an uncertain request.

Validation uses synthetic store event sequences, deferred ownership/stop fixtures, and server-rendered notice markup. These are not a live-user acceptance receipt. Rebuild/reload is needed to adopt the updated main process and UI. This feedback change is independent of the scheduler's agent/conversation binding validation.

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
# Use a CLI-compatible host Node for non-Electron tests (e.g.22.23.4/24.22.1).
node --test test/*.test.mjs
bun test test/*.test.ts
bun run build
bun run lint
```

Native fixtures use only isolated local API servers/profiles. They exercise installed SDK execution, human approval/denial/correction, plan mode, vision, delegation, exact-run cancellation, receipt deduplication, retry/fencing and Electron-as-Node launch. Packaged tests can select a private validation bundle with `COWORK_SDK_TEST_PACKAGED_CLI` and `COWORK_SDK_TEST_PACKAGED_SDK`; they do not install or release it.

A macOS arm64 unsigned validation bundle is not Windows/Linux validation, a deployment, a live-provider/remote-machine test or human acceptance. Preserve those distinctions in delivery receipts. Existing worktree changes are not part of a commit unless explicitly reviewed and authorized.
