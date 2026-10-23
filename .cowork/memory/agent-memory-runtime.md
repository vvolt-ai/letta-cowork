# Scoped agent memory in WS execution

Source/date: Bhavesh, approved 2026-10-22 parity plan. Level 2 technical context.

New memfs/scoped-memory helper binds actual client/agent/account, downloads primary+attached shared repos and feeds WS notice, AgentMemory status/list/read/search/sync, per-call env, child contexts and shared Skill roots. Does not use legacy process-global memory path/key fallback for execution or MemoryDialog. Dialog IPC explicitly receives active session agentId/lettaConnectionId; late responses cannot overwrite another agent's display.

Vera mode uses authenticated descriptor/read-only smart Git proxy, provider keys stay server-side. Descriptor scope survives JWT refresh; changed/logout credentials mask cached paths and require exact-scope revalidation. Capture one credential across discovery/Git, pin resolved connection and x-letta-memory-scope; generation guards prevent stale inspection/read after newer denial. Current source recognizes /letta/runtime and /letta/runtime/v1. Server needs MEMFS_ALLOWED_PROVIDER_ORIGINS for custom provider origins (default api.letta.com).

No automatic tag/attachment/commit/push/reset/stash/rebase or live fleet edits. Shared clones shallow; primary full. Existing dirty/conflict/diverged/unmanaged files/remotes preserved, no placeholder repair. Explicit memoryDisabled supported; CLI settings migration and reflection workers not ported. New Vera proxy intentionally has no push/receive-pack; local edits are not remote persistence. Generic FS tools retain host semantics, not a new OS sandbox.

Offline fake Git/HTTP/auth-race/status/child/env/Skill tests; synthetic UI scope-switch/race preview only (screenshot agent-memory-scoped-ui.png in local browser artifacts). Build output sent to /tmp to preserve pre-existing dirty dist-react/index.html. No source reset of existing user/UI/skill edits. Local compilation is not restart/new tool schema adoption. See docs/agent-memory-runtime.md. Canonical skill instructions follow-up and actual deployed end-to-end checks remain separately required.
