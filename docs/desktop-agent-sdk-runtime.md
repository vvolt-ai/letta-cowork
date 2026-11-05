# Desktop Agent SDK execution

## Paired SDK upgrade — 2026-11-05 (local, not activated)

Current exact pair: SDK0.8.70 (f34cb1f9a2840523d87ac8313319ff57afb57d17) / Code0.34.41 (233c0034492b9782c9bec01002226b891e514745), verified against latest stable GitHub releases and npm integrity/peer metadata. SDK0.8.68→0.8.70 changes manifests/peer floor only; the public lifecycle API is unchanged. Code's engine floor is unchanged, so existing Electron45.1.0/Node24.22.1 remains supported. Package/Bun-lock pins, strict host-info check, fixtures and versioned shared-pool identity are updated together. No global CLI, Node or Electron upgrade.

Upstream reviewed: named-run/same-OTID busy recovery; explicit/default permission persistence; attached-skill last-good fallback; unsupported ChatGPT model plan rotation; optional harness/fork_context delegation; managed sandbox exposure. Current SDK-owned stream/abort/queued-removal, scoped native callbacks, permissions and Task isolation remain. No automatic history sharing, external coding-worker routing, managed port publication, new model loop or extra approval/retry layer is added. Native mode_is_default is optional; we preserve the explicit requested Cowork mode rather than replacing it with an inherited default.

One compatibility correction aligns backend terminal-state recognition with upstream: expired can settle exact owned Stop/cleanup verification without changing the authoritative SDK result into success. Regression includes an interrupted SDK result plus an expired backend run; pending/running/unknown work is not treated as terminal.

Verified332 Node/native tests (318 supported embedded-Node fixtures plus14 ordinary-Node process-shim unit checks),62 Bun UI tests and full build. The existing whole-repo lint5 errors/format parser+style baseline remains, outside this focused upgrade. Source/build/native fixtures do not activate the running app or establish live provider/Windows/Linux/installer acceptance. Existing generated dist-react/index.html and test-results are preserved and excluded. Backend npm audit old/new lock counts are identical at49 (including2 critical); no unrelated force fix. No restart, real conversation/tool action, release, commit/push or deployment performed as part of this update.

Sources: [SDK comparison](https://github.com/letta-ai/letta-agent-sdk/compare/v0.8.68...v0.8.70), [Code comparison](https://github.com/letta-ai/letta-code/compare/v0.34.39...v0.34.41). Rebuild/reload main only after current work is safely settled; do not replay an uncertain prior prompt.

## Publication validation — 2026-11-05 (pre-upgrade snapshot)

Current source validation supersedes the older baseline counts below:317 Node/native fixtures pass under Electron's supported embedded Node24.22.1,14 process-shim/CI unit checks pass under ordinary Node,62 Bun UI/source tests pass, and the complete desktop build passes. The two unit-only suites use process.execPath in generated shebangs or sanitized child environments and are not valid under an Electron executable substituted as plain Node. The obsolete email fast-path assertions now check the canonical configured-MCP/no-shell-fallback contract, not retired mounted Odoo/curl wording. The late raw-hint result test injects its control hint deterministically rather than racing socket disposal; no production delay or outcome rewrite was added.

Bundled email-processing1.3.2 matches the complete canonical VerivoltDev/Skills package fingerprint at ebd912655534b8afffe689648eae5c02eb279f3d. Its contract checks report19 passed/1 skipped and8 PDF helper fixtures passed; no actual customer document was processed. Whole-repo lint remains blocked by5 errors in unchanged files and formatting checks retain existing parser/style failures; no broad rewrite was applied. Generated dist-react/index.html and test-results artifacts are excluded. These are source/fixture receipts, not Windows/Linux/live-account/provider acceptance, an app reload, package/release/signing or deployment.

## Current architecture

Electron main runs **Letta Agent SDK 0.8.70 with Letta Code 0.34.41**, using a pooled local native App Server's **API harness**. The main-owned pool persists hosts per trusted provider/account/connection and agent-scoped disabled-memory policy; conversations and later turns reuse them. See [local shared App Server design](desktop-shared-app-server.md). The SDK owns model turns, tool continuations, streaming and native retry policy. There is no custom REST/SSE model pump or legacy execution fallback.

`libs/runner/session-manager.ts` selects the SDK adapter; `libs/runner/sdk/session.ts` supplies Cowork's UI/tool lifecycle and owns a per-turn SDK client plus shared-host lease. `services/letta-runtime/desktop-app-server-pool.ts` owns process lifetime, runtime admission and fences. Chat, continuation and existing background callers continue through `runLetta`. Task/Agent use a protected parent capability to create another SDK session; the delegated manager supplies policy, not another model loop.

The SDK's `backend: 'remote'` means its authenticated **loopback App Server transport**, not a selection of a Vera Remote computer. The native server's provider backend is `api`. Existing tool-specific local/remote execution selection remains authoritative.

## Electron runtime baseline

As of2026-10-28 the desktop is exact-pinned to Electron45.1.0 (embedded Node24.22.1, native ABI150). The pinned node-abi4.40.0 mapping and Bun-local rebuild command support that ABI. Removed login-item hidden-state fields are replaced with the macOS wasOpenedAtLogin signal plus the existing --hidden argument; Linux does not call unsupported login-item settings. Manual launches remain visible. macOS13 or later is now required; the supported installer targets remain64-bit.

The SDK/CLI pair is explicitly upgraded together to0.8.68/0.34.39 on2026-11-03. SDK0.8.68 requires Code>=0.34.39 <0.35.0; that CLI requires Node^22.23.4 || ^24.22.1 || ^26.12.1. Electron45.1.0 now meets the embedded Node floor that blocked45.0.0. The App Server handshake still rejects any CLI version other than the exact pin. Bun lock and runtime contracts verify the trio. No nightly Electron or global CLI/Node upgrade is used.

Historical October28 verification of the prior SDK0.8.55/Code0.34.26 pair used actual Electron45.1.0 against fixture APIs/private homes, including approvals, vision/slow turns, delegation and correlated cancellation.190 Node tests,17 Bun tests,12 actual-Electron native fixtures and12 final packaged SDK/CLI fixtures passed. An isolated sandboxed renderer tested real preload/contextBridge/IPC without app accounts/services/login items. PTY/Sharp executed from development and the validation ASAR. The isolated ad-hoc-signed macOS ARM64 .app passed deep/strict resource-seal verification; no new DMG or release was generated. One first cold parallel packaged cancellation returned SDK_NATIVE_TREE_CLEANUP_UNVERIFIED; isolated and final full parallel checks passed without weakening cleanup guards. Its initial cause is not established; do not treat that as a fixed cancellation race or live acceptance. Windows/Linux, real OS-login and live-provider acceptance remain separate. Ad-hoc integrity is not notarization/Gatekeeper trust.

## November3 paired upgrade validation

SDK0.8.68 / Code0.34.39 exact package/Bun-lock pins and strict native handshake/release fixtures are aligned; Electron45.1.0/Node24.22.1/ABI150 and the canonical lookup cancellation fix remain unchanged. Registry peer/integrity metadata and upstream source reviewed. SDK0.8.67→0.8.68 changes manifests/lock only; CLI fixes live-duplicate recovery-consumer attachment, terminal transfer/replay during recovery/handoffs, conversation-ID-only agent messaging and destination attribution from the enqueue receipt. These do not prove a fix for a normal post-answer desktop finalisation wait or intermittent direct conversation GET stall.

Current local validation:268 Node tests (including installed-client abort, actual Electron/native approval, vision, delegation and correlated cancellation),28 UI tests, Electron/project TypeScript and isolated Vite build pass. Changed integration lint has0 errors/91 warnings; existing whole-repo lint/format findings are not rewritten. UI build output is isolated under ignored .letta/validation/sdk-0868, preserving pre-existing dist-react/index.html/test-results. New installer/ASAR signing, Windows/Linux/live-provider and live completion-delay acceptance were not run. No global CLI/Node update, active-run replay/cancellation, agent-memory/business mutation, app restart, commit/push or deployment. A controlled main-process reload/rebuild is required to adopt the new pair.

## Historical November2 paired upgrade validation

SDK0.8.67 / Code0.34.38 are exact-pinned in package.json and bun.lock; strict host-info and version-pair fixtures match the new CLI without relaxing backend/protocol/ownership checks. Electron45.1.0/Node24.22.1 and ABI150 remain unchanged. Source comparison shows SDK0.8.55→0.8.67 changes manifests/lock and the peer runtime floor; underlying CLI updates include queued inbound delivery, failed-approval result preservation and external-tool reconnect handling. These are upstream changes, not proof a particular live busy conversation recovered.

November2 local checks:255 Node tests (including actual Electron/native cancellation, delegation, approvals, vision and slow-turn fixtures),28 UI tests, Electron/project TypeScript and isolated Vite build pass. Full lint remains blocked by5 errors in unmodified files; full format checking also fails on existing formatting/parser issues, including the unmodified vite.config.ts inline type import. This upgrade did not rerun installer/ASAR signing or Windows/Linux/live-provider validation; prior packaged receipts do not certify the new pair. Existing modified dist-react/index.html and test-results remain untouched by the isolated UI output. No global CLI/Node update, running app restart, live agent/message/memory mutation or deployment was performed. Bhavesh separately authorized source commit/push on2026-11-02. Sheilon's standalone CLI installation is a separate update.

## Canonical lookup cancellation, November2

Existing-conversation lookup and post-model-update confirmation reads have a20s deadline and the owning session's AbortSignal. Phase-specific errors are SDK_CONVERSATION_LOOKUP_TIMEOUT and SDK_CONVERSATION_CONFIRMATION_TIMEOUT; existing SDK_SESSION_CLOSED cancellation semantics remain. The read wrapper observes late failures/results even if a transport ignores abort, so failed initialization settles without the old60s outer-watchdog plus30s cleanup wait and cannot launch a late native runtime or retain pre-input capacity slots. Scope is validated before/after the read. Conversation creation/model writes are not replayed by this helper; model/tool/approval execution deadlines and stop/ownership verification are unchanged.

Vera's fetch adapter propagates either Request- or init-carried cancellation into the auth probe, stops waiting when that reader is cancelled and checks before any401 retry. Shared refresh may continue for other readers; caller cancellation does not cancel their work or bypass auth-generation/actor fences. This hardens a confirmed cancellation gap, not proof that the original network/auth/provider lookup stall is repaired. Tests use synthetic APIs and a hung loopback GET through the installed Letta client, not a replay of the user's prompt. Running Electron main must be safely rebuilt/reloaded to adopt source changes; no automatic restart or live run mutation.

## Conversation HTTP diagnostics, November3

`createLettaRuntimeClient` now observes only GET `/v1/conversations/<id>` metadata requests through the already selected direct/Vera fetch adapter. `[runtime-http]` records client correlation ID, attempt sequence, UUID-only conversation identifier (other/default IDs are classified without arbitrary text), source, start/headers/abort/error phase, elapsed milliseconds and HTTP status. No URL/query/header/key/body/prompt or arbitrary exception text is emitted; responses are returned untouched without cloning/reading their body. Each fetch call is observed, not retried by diagnostics. Sink failure cannot change request behavior.

This is a diagnostic patch, not a repair or proof of the recurring live HTTP stall. Direct fresh-process/Electron metadata checks can succeed while the running app times out. After a controlled main-process reload, collect the original lookup phase plus its runtime-http events: start with no headers isolates a response wait; retryable HTTP statuses followed by attempts expose SDK recovery; headers200 followed by lookup timeout points to body/parsing or subsequent SDK handling. Header arrival alone is not successful parsing, turn completion or ownership proof. No source/credential fallback, dispatcher replacement, deadline increase, prompt replay or automatic app restart is introduced. The post-answer settlement/readback wait is a separate pending investigation.

## SDK lifecycle and Stop, November3

SDK `result` is the authoritative terminal outcome, not send() completion, assistant fragments, loop status or native hints. Preserve SDK success/errorCode/errorDetail (with normal secret redaction); native hints cannot rewrite the result. UI final text prefers result.result ?? accumulated assistant text, supports result-only answers and deduplicates repeated same-client receipts. Failure presentation uses errorCode and errorDetail before legacy error; typed interrupted is not a five-minute retry diagnosis. Subsequent result-contract validation:38/38 SDK/native tests,54/54 UI tests and build pass; the full-suite baseline below predates these small result-presentation additions.

The pinned SDK session that sends a turn is also the session that owns cancellation. `send()` starts one internal `session.stream()` consumer; UI subscriptions read its recorded events and do not create competing SDK consumers. Tool cancellation does not terminate that consumer. Keep consuming the original SDK stream through its terminal result, drain owned callbacks/children, then close transport and release the client lease. `close()` is not cancellation; the adapter refuses to quietly abort an unverified owner from cleanup.

Active Stop uses public `session.abort()`, including the SDK's abort-request tracking. Raw `abort_message` loops with hand-picked run IDs are removed. Before invoking public abort, the private socket/relay boundaries still validate canonical runtime scope and OTID-correlated active run ownership. The relay refuses broad or unrelated backend cancellation, and new model submissions are blocked once stopped. If natural completion wins a Stop race, preserve the actual SDK result rather than fabricate an interruption.

For a queued-only input, select the SDK queue item whose `clientMessageId` matches this turn's own OTID and call `removeQueuedMessage(item.id)`. A successful exact-item acknowledgement is a queued-cancellation receipt, not a synthetic model result. If removal loses the start race, recheck ownership before public abort. Foreign queued/active inputs are never selected. Main-process turns not yet sent are invalidated in their local FIFO separately.

Ordinary SDK completion no longer performs Cowork's redundant run-status GET/polling, timeout retry or cached-result replay. Those implementations caused a completed SDK result to become a permanent UI error after a transient readback timeout and are removed, including obsolete generated helper output. An original SDK terminal result, correlated scope/run IDs, local drain and stable ownership are the normal gate. API status alone, reader EOF, expired timeout and `requires_approval` are not terminal proof. A native frame can trail an SDK failure result; retain the original result and await scoped local correlation rather than discard it or resend input. Fixed timing milestones distinguish SDK receipt, owned drain and final delivery.

**Stop-only delivery check:** Native0.34.39 acknowledges local abort before its fire-and-forget backend-cancel task settles. Real native-process fixtures proved that immediately closing the host can cut off that cancellation HTTP request. After public abort and SDK terminal drain, keep the owned transport/lease alive for bounded10s read-only verification of the exact observed run IDs and account/agent/conversation. This is not a second cancel mechanism, uses a signal independent of tool Stop, and never gates ordinary successful results. API/auth/ownership/nonterminal failure retains the fence instead of claiming stopped. Shared App Servers remain alive; closing one client does not terminate neighbouring runtimes.

UI Stop state is **Stopping** until owned SDK completion/queued removal and cleanup settle; then Idle. **Nov5 admission rule:** Stopping/unverified diagnostics never permanently lock the composer or reject independent new messages. New intent is acknowledged as queued and still waits for the previous handle/FIFO plus the SDK's actual ownership checks—no controller force-clear, concurrent submission or automatic replay. Stop failure does not invalidate requests accepted after Stop. Backend-stamped `afterStop` dispatch starts a fresh UI turn while retaining prior uncertainty as a separate dismissible warning; stale old prompt/status events do not clear a pending Stop. A subsequent Stop after new intent captures the current validated controller rather than reusing an old failed target. Retrying Stop without new intent retains the original exact target. This fixes admission/UI lockup; it does not claim the underlying scoped provider-relay502 was repaired. Stop-and-continue cannot send on failed Stop. `stopState`/`stopRequestId` reject stale cleanup/results. Permission cards are not cleared optimistically. Received text and typed drafts survive failure; a failed stop-and-continue restores its typed addition only to the same still-empty selected composer. Ownership/no-controller errors no longer advise a blind five-minute resend. IPC fire-and-forget and runner-finally promises are observed.

A failed real controller remains the captured retry target. A missing/ambiguous controller produces SDK_STOP_SCOPE_UNAVAILABLE and a fenced, explicit diagnostic; it is never replaced by an invented always-failing target or a fresh SDK/model session. If the original initializing controller becomes visible, a later explicit Stop may capture that existing exact owner. No historical controller is invented, no lock is force-cleared, and old unknown executions still require reconciliation. Source changes are not evidence an already-running old controller was recovered.

Final local validation:326/328 Node tests pass under strict unhandled-rejection mode; only the2 unchanged committed email-skill wording expectations fail. All49 UI tests, Electron/project TypeScript and isolated Vite build pass; scoped lint has0 errors/warnings remain. Validation uses installed public SDK APIs, private loopback/native processes and fixture backends; live provider/account acceptance and controlled main reload remain separate. Tests cover interruption tracking, natural-completion race, one SDK consumer, callback drain, no premature close, ACK without terminal, late-terminal retry, exact queued removal/start race, foreign-input isolation and actual scoped backend cancellation delivery. The two committed email-skill wording failures remain an unrelated baseline issue. No live prompt replay/cancel, app restart, commit/push or deployment is implied.

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

## Startup latency and request-local profiling

Source update2026-10-29: low-risk first wave, not a claim about production latency. Canonical conversation/agent/account validation still happens before setup. An explicitly requested model equal to the retrieved conversation model causes no redundant PATCH/confirmation read; real changes retain update+readback validation.

Policy supersession requested later2026-10-29: after ownership validation, the memory step only constructs explicit-sync capability and marks memory_checkpoint as skipped. No automatic local Git/API refresh, background download or8s foreground wait runs on chat/delegation startup. Existing files are preserved, explicit AgentMemory sync/read/push remain, and unsynced local paths require explicit preparation. Server-side agent memory is not disabled. Secret loading has a dedicated10s read deadline plus owning cancellation signal, not an SDK-wide logical-turn deadline. Failed/late reads do not apply environment data or borrow another actor's credentials; inherited context and unavailable-secret behavior remain. Token refresh is generation-fenced across logout/login/org changes and API-client retirement, with same-generation deduplication; a cancelled reader cannot restore old auth state through a later refresh. Tests stub persistence/credential IO.

Display-name lookup uses the captured SDK account and a bounded scope+agent label cache, and does not block stream consumption. Late name completion does not emit a terminal/running UI status or change a closed turn. Native processes/private homes still launch per logical turn: there is no warm-host pool, cross-turn memory-state cache or weakened settlement/ownership policy in this wave.

`[performance]` events contain only a random traceId, fixed stage/event/outcome names and monotonic elapsedMs/durationMs. They never include prompt/text, account/agent/conversation IDs, URLs, keys, environment contents or error bodies. Continuation queue wait and runner/SDK stages share a trace; delegated SDK sessions get separate traces. Inspect conversation_lookup, previous_cleanup, model_update/model_confirm or model_unchanged, memory_checkpoint (skipped; deferred belongs to earlier traces), runtime_env, native_launch/connect/ready and input_queued. The first_stream_event milestone can be protocol metadata; first_assistant_text means nonempty assistant text received by the main process, not renderer first paint (renderer batching remains separate). Input queueing does not measure model completion. Old module-uptime timing was removed, and the object-created log no longer implies initialization finished.

Use cold/subsequent-turn live traces to identify the remaining critical path before adding scoped host pooling or broader caching. Synthetic overlap/cancellation/refresh tests and native local-API fixtures validate behavior, not savings on a live provider or the previously observed21.94s initialization gap. Rebuild/reload is required; no live model request is sent as a performance test.

## Progressive renderer updates

Typed SDK assistant deltas are accumulated once in a per-conversation draft store. Chat views subscribe with `useSyncExternalStore`; publication is batched at50ms without replacing Zustand's global sessions tree for every token. The main chat and embedded conversation viewer use the same snapshot, including when mounted mid-turn. OTID lineage preserves chunks across fallback UUID changes without merging distinct API runs. Final results commit canonical text once and clear transient publication/timers.

Regression fixtures: `test/assistant-live-draft.test.ts`, the existing render-churn test, and `test/assistant-streaming-fixture.html` served by local Vite. The browser fixture exercises the actual hook/message component before any final result, without authentication or live model calls.

## Completion and cancellation

Completion requires the original SDK terminal result correlated to this logical input, scoped terminal evidence, settled local callbacks/children and stable ownership. There is no redundant run-status polling on normal completion. `requires_approval`, SDK reader EOF, UI removal and an expired timeout are not success or stop proof.

Cancellation blocks new local effects, waits for pending input/context work, calls public abort() on the same SDK session, consumes its terminal result, and verifies local drain plus stop-only backend cancellation delivery before closing its client transport. Queued-only work uses removeQueuedMessage for the exact own item instead. The native API backend currently uses the agent messages-cancel endpoint with an explicit run_ids body; the relay validates every ID and rejects broad cancellation. New model submissions after stop are denied. Closing a client does not tear down a pooled host; host process-group cleanup belongs to actual host shutdown.

Failed Stop retains the real control path for explicit retry. Missing control paths are diagnosed, never replaced with a fake always-failing controller. Unverified execution/cleanup keeps the conversation fenced; it is not replayed, relabelled completed or silently handed to another account. Loss of the control path or unresolved process cleanup can require reconciliation rather than a forced reset. Normal successors may await cleanup only after prior execution is already verified terminal.

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
