# Per-agent memory in Cowork execution

Cowork now prepares primary and already-attached shared memory for each eligible SDK-hosted session using its actual selected Letta runtime connection. It exposes **AgentMemory** (`status`, `list`, `read`, `search`, `sync`, explicit confirmed `push`)  and supplies scoped memory paths/status to the model and local tools. This is read/use/safe-refresh parity, not the full upstream memory-worker/reflection/auto-commit subsystem. [SDK execution](desktop-agent-sdk-runtime.md) uses native stateless mode to preserve this existing scoped checkout rather than create a competing memory owner.

## Behavior and scope

- The active session's agent and selected connection determine transport. Provider credentials are not borrowed from another/global source by the new scoped memory helper.
- For Vera-managed clients, both SDK base forms `/letta/runtime` and `/letta/runtime/v1` map to the new `/letta/memfs/:agentId/descriptor` and read-only smart-HTTP download routes. The descriptor's opaque user/workspace/provider scope ID, not a rotating JWT, identifies the local cache. Token refresh can reuse the cache after descriptor revalidation. Cached paths/reads are withheld when credentials change until that check succeeds; logout never falls back to the captured token. Descriptor and Git work use one captured credential and reject changed-identity results. The resolved connection and `x-letta-memory-scope` are pinned on Git requests; a changed scope must fail rather than adopt old memory. Generation checks prevent older local inspections or reads from restoring paths after a newer denial/catalog change; repository errors remain errors until a successful authorized refresh. The server's default destination policy is `https://api.letta.com`; administrator configuration is required for other exact provider origins.
- Direct-mode clients use their actual scoped provider origin/key and attached-repository metadata. No agent tags, shared attachments, permissions, persona or provider settings are automatically changed.
- Primary lives at the scoped agent's `memory` directory; attached repositories such as `core_system` mount beside it only when actually returned by current authorized discovery. Do not assume every agent has that attachment.
- Startup has an 8-second foreground checkpoint. Bounded background download may continue; the notice/tool reports syncing or unavailable until verification, never claims a timeout is success. Later turns use a 60-second refresh checkpoint and local status inspection.
- Git operations/read callbacks serialize per checkout across concurrent sessions. Only clean, nondiverged repositories fast-forward. Dirty files, unpushed commits, conflicts, wrong remotes, unsafe paths and existing unmanaged folders are preserved and reported. No automatic stash/reset/rebase/delete/commit/push.
- Shared clones use depth 1, consistent with inspected Letta Code `origin/main` `8878250a1`; primary history remains available. Original source checkout compared was `37c2ab0fc80b58bff0fc2ccdbe838a2d72d45bf7`.

## Agent tools and environment

Examples (repository names must be returned by the actual tool):

```json
{"action":"status"}
```
```json
{"action":"list","repository":"memory","limit":20}
```
```json
{"action":"read","repository":"core_system","path":"README.md"}
```
```json
{"action":"search","query":"review context","limit":10}
```

`sync` requests a real refresh; it never commits or pushes. `UNPUSHED_COMMITS_PRESERVED` means local history was retained, not uploaded. For a supported **direct-provider primary repository only**, obtain its exact committed revision from `status`, then explicitly authorize publication:

```json
{"action":"push","repository":"memory","confirm":true,"expectedRevision":"<exact full revision from status>"}
```

Push requires the same runtime agent/account, clean checkout, unchanged HEAD, an existing current branch and fast-forward ancestry. It never commits, selects/creates branches, merges, stashes, force-pushes, publishes tags/submodules or writes shared repos. Dirty files, operation markers, unsafe local Git config, changed remote/scope/confirmation and remote-side changes stop publication without discarding local history. Auth/cancellation guards apply before dispatch and readback. One dispatch only: an uncertain result is `unverified`, not automatically retried; verify the original exact remote state before any new attempt. A confirmed remote ref does not prove provider API projection or current model memory recompilation.

Use this authenticated tool rather than expecting a later plain shell `git push` to inherit sync credentials. The app captures the existing scoped provider credential and supplies URL-scoped headers through the child process environment only; no token prompt, secret argv, credential-helper file or global Git changes. Existing owner hooks remain, but arbitrary hooks/recursive operations are disabled for managed transport. Do not use push to bypass governance/managed-file ownership. Reads are bounded and reject scope overrides, traversal, `.git`/hidden paths and symlinks. No arbitrary `agentId` is accepted in tool arguments. Read/status actions work in plan mode; explicit sync does not.

Per-call tool context provides `MEMORY_DIR`, `LETTA_MEMORY_DIR`, `AGENT_ID`, `LETTA_AGENT_ID` to local shells without mutating `process.env` or treating paths as runtime secrets. Missing scoped memory does not fall back to someone else's global directory. Read/Glob/Grep take literal paths, not shell-variable expansion. Agent-owned and verified shared `skills` roots participate in Skill discovery; denied/missing memory cannot silently use a legacy account's folder.

Subagents retain the same identity's memory or prepare their own target scope. A failed different-agent preparation clears the inherited root rather than borrowing it. Server-local or desktop-local paths are not promised to exist on another remote computer; use the owning runtime's scoped read capability or a separately authorized mount.

## Memory dialog

The memory dialog sends the **active session's explicit agent ID and Letta connection ID** through preload/IPC. It uses the same scoped helper as execution, not the last globally active agent or a process-wide provider token. Switching agent/account invalidates older results and clears the old display while loading. With no selected agent it asks for one rather than inspecting a different directory.

The response includes bounded files/description/previews plus actual memory/shared-discovery state and a truncation flag. The UI states that local checkout status is separate from loaded system blocks. Cached/blocked/error output is not described as current. Repository-qualified paths distinguish primary and shared files.

## Limits and rollout

- Vera-managed transport remains **download-only**: no `git-receive-pack`, automatic commits or pushes. Explicit push returns `MEMORY_PUSH_TRANSPORT_READ_ONLY`; this desktop change does not open backend writes. Direct-primary transport is supported, subject to live provider permissions. Shared repositories remain excluded from publication even if provider metadata advertises write access. A local edit/commit is not a remotely synchronized learning. Ordinary file tools still follow host permissions; this feature is not an OS sandbox or permission to change protected/governance/shared files.
- Git auth uses child-process-only environment configuration, not argv/URLs/plaintext credential helpers. Managed read-sync disables local hooks and unrelated inherited secret variables. Existing owner hooks are preserved; an empty primary hook slot receives the existing frontmatter/read-only guard. No existing dirty memory or credential artifacts are automatically cleaned up.
- `memoryDisabled` is an explicit session opt-out; absent/unprovisioned repositories are reported, not enabled. Automatic fleet provisioning/rewrites, CLI settings migration, shared repo attachment and reflection remain separate work.
- Fresh files, remote HEAD, compiled system blocks and the agent's current prompt are distinct. Download does not prove a running prompt has recompiled; agents can read actual files and must report evidence limits.
- Deploy the server MemFS descriptor/download routes before enabling a rebuilt desktop against Vera-managed connections. A running old app requires restart/reload; compilation or an image build alone does not prove new tool schemas are active.
- After release, Bhavesh/maintainer should update applicable canonical Vera/runtime skill instructions against the actual installed schemas. Existing dirty bundled skill work is not overwritten by this patch.

## Validation boundary

Offline fake Git/repository/HTTP tests cover primary/shared downloads, JWT rotation, scope changes, dirty/diverged preservation, path/tool/env/child isolation and shared Skill lookup. Synthetic real Git-HTTP repositories additionally validate preserving then publishing local commits with ephemeral authentication, remote-ref verification, no tags/submodule recursion despite conflicting local config, no stored keys, dirty/stale/diverged/cancelled refusal and no automatic mutation retry. No actual agent memory or policy changes are published by these tests. Backend tests cover binary proxy routes and metadata authorization; they do not verify live provider permissions or a live agent consuming new memory. Typecheck and a UI build use a temporary output directory to preserve pre-existing generated-output edits. A synthetic UI preview is not production acceptance.
