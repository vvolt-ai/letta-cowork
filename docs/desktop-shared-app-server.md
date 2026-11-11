# Local shared App Server pool

Cowork now defaults to a persistent Electron-main-owned pool instead of starting a native App Server for each logical request. Hosting stays on this computer, using Electron-as-Node and the pinned SDK0.8.81/Code0.34.51 API harness. This does not move desktop tools onto Vera server, change the selected model provider, or create a worker thread for every chat.

## Boundaries and lifetime

- A host boundary includes the selected provider source/full API path, trusted account/auth-context identity, selected connection, direct-key fingerprint and native policy. Fingerprints/keys are not logged.
- Desktop native MemFS remains disabled and SDK turns remain stateless. The initial pool therefore partitions by agent, like Vera's explicit memory-off case. Conversations and successive turns of that agent/boundary reuse one process. Different agents still have separate native settings caches; no agent tags, prompts or memory policy are changed to obtain wider sharing.
- Vera same-actor JWT refresh does not change the boundary. Logout/login, organization/account/context replacement or direct-key/provider/connection changes fence the old context. Direct-Letta sessions also bind Cowork's tool actor, so their Vera-backed tools cannot silently adopt a newly signed-in user.
- Maximum16 cached/starting/stopping process boundaries; the existing16 active-session limit remains. Healthy idle hosts stay available until application shutdown or invalid-context retirement. Invalid idle contexts are pruned on acquisition. There is no unbounded cache, forced active/fenced eviction or implicit fallback when capacity is exhausted.
- Pool keys and runtime locks are local to one Electron main process, not durable distributed/exactly-once locks. An app restart does not prove an unknown backend operation stopped.

Each request still performs canonical conversation lookup before acquiring a lease. The20s read deadline and safe metadata HTTP diagnostics are unchanged. Pooling cannot directly repair an HTTP lookup stalled before acquisition.

## What remains per turn

Each lease has its own SDK client/WebSocket, native controls and input correlation, tool aliases/callbacks, user approval decisions, allowed tools, CWD, runtime environment, scoped memory access and child-task lifecycle. Native tools remain base:none; local callbacks and explicit selected Vera Remote/no-local-fallback rules remain authoritative. Model execution still follows the configured direct Letta/Vera route. Vera API/tools may still make their existing network requests; local pooling is not a promise of zero Vera calls.

The fixed-origin relay keeps provider credentials in main, passes only scoped relay capability to the child, refuses invalid paths/redirects, and retains bounded bodies. A trusted active-lease registry admits model input only for its canonical conversation and registered submitted input. Stopped/terminal/unknown leases cannot start another model request. Cancellation requires exact run IDs belonging to one lease; mixed/foreign IDs and broad cancels fail closed. One conversation's cancellation signal is never the shared process's lifetime signal.

## Completion, release and shutdown

Closing a request is **not** closing the shared process. Native/SDK client closure must finish and ownership proof remain stable before the runtime lease is freed. A failure before submission may release after verified client cleanup. Unknown submitted work or failed client cleanup retains its runtime fence; killing/replacing a local process cannot unlock that backend runtime. Other conversations can continue or use a replacement host after the dead local process tree is independently verified cleaned.

Normal completion still requires native terminal evidence, drained callback/child work, backend terminal readback and a stable snapshot. No UI-idle shortcut or automatic input replay is added. Abort joins existing terminal disposal instead of sending control requests against a half-closed client.

App quit suspends admission, drains owned sessions, then terminates pooled hosts using existing platform-specific process-tree verification. Host teardown refuses active leases. A failed stop/tree proof pauses shutdown rather than declaring it successful; unresolved runtime fences are not erased. Only pool-created scratch HOME directories are cleaned with their own verified process teardown; existing user checkouts, manual AgentMemory mounts and data are not migrated or reset.

## Evidence and limits

`test/desktop-app-server-pool.test.mjs` verifies coalesced startup, sequential reuse, cancelled-waiter independence, key/account/connection/native-policy isolation, same-runtime exclusion across boundaries, unknown/cleanup fencing, dead-host replacement, cache capacity, active-lease shutdown protection and close-before-release ordering.

`test/desktop-shared-server-native.test.mjs` runs the actual pinned CLI under Electron-as-Node against an isolated loopback fixture API. Two conversations overlap on one process with independent approval waits, repeated tool-call IDs and distinct CWD/environment/tool sets. A can finish and close while B is awaiting approval; B then continues. A subsequent turn reuses the host. Targeted cancellation of another conversation sends only its owned run IDs while its neighbour remains running and completes. No real provider/model/business/agent-memory operation is used. Conservative scheduling of unknown effectful tools is retained, not weakened to make a concurrency test pass.

Final local run:294 Node tests and28 UI tests pass; Electron/project TypeScript and isolated Vite build pass. Changed-source lint reports no errors (warnings remain). In the real fixture, cold host acquisition waited about1.16s; later warm acquisition rounded to0ms, while a fresh SDK connection still took about0.31s. These are fixture observations, not production latency guarantees or proof that the prior completion-delay/metadata-stall incidents recovered.

The earlier metadata-diagnostics patch remains intact. A requested independent reviewer timed out without a usable report; do not claim completed independent review or production approval. New ASAR/installer signing, Windows/Linux physical execution, live provider/remote-machine acceptance and controlled app reload are separate checks. Source changes do not restart the running main process. No commit, push, release or deployment is implied by local validation.
