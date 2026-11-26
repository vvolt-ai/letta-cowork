# Authenticated Vera tool access in Cowork

Cowork's fixed `VeraMcpListTools`/`VeraMcpCallTool` bridge covers three distinct catalogs under the selected signed-in Vera user/server:

- **native**: stateless JSON-RPC `/mcp` (remote environments/machines, channels, email, schedules, identity and knowledge);
- **graph**: governed `/neo4j-mcp` with its own instance permissions;
- **configured connectors**: existing `/mcp/tools/fetch` and `/mcp/tools/invoke`, including Odoo. No retired Odoo REST, credentials, account switching or legacy adapter fallback is added.

Authentication is not authorization for every resource or operation. A listed tool means its definition is available, not that the user can use every target. Existing backend permissions, sharing, profile/agent policy and required confirmations remain authoritative. Server-hidden tools cannot be exhaustively enumerated by this client. No production access/role changes or automatic business tests are part of this feature.

## Discovery and invocation

```json
{"area":"remote","limit":20}
```

Default discovery checks all catalogs with `Promise.allSettled`; one optional endpoint failing cannot conceal another catalog's available definitions. Other areas: `native`, `identity`, `channels`, `email`, `schedules`, `knowledge`, `graph`, `configured_connectors`, `all`. Configured connector selection and prod/stage semantics remain explicit:

```json
{"area":"configured_connectors","serverSlug":"<verified-slug>","query":"<tool>","offset":0,"limit":20}
```

Use exact returned `toolName`/schema. Native names are unprefixed `vera_*`; governed graph names are unprefixed `neo4j_*`. Configured names stay `connector__tool` and are never rewritten to native calls. `vera_native`/`vera_graph` are native catalog selectors; use explicit configured area if a connector happens to have that slug. Conflicting selectors fail instead of silently retargeting. Namespaced native input may normalize for search only, never for invocation.

Native invocation rechecks the current catalog before one call. No arbitrary base URL, token, user/organization override or alternate-principal fallback is accepted. Login/logout/server changes invalidate pending responses; same-identity token refresh remains supported. Native and configured tool calls disable automatic authentication replay and reject redirects. A transport error after submission is **unconfirmed**, not safe to retry. Inspect the original operation receipt, especially for sends, writes and remote execution. Cancellation of an HTTP read does not prove a remote process stopped.

## What an unavailable result means

Discovery includes `catalogs`, `searchedCatalogs`, `coverage` and pagination. A configured-catalog page may be partial; continue using that catalog's returned cursor/offset rather than assuming a globally complete inventory.

| Evidence | Reported reason / action |
|---|---|
| No authenticated desktop session / HTTP 401 | `not_authenticated`; verify the current supported login flow |
| HTTP 403 | `permission_or_policy_denied`; do not change identity or bypass the denial |
| HTTP 404 | `endpoint_unavailable_or_not_visible`; not proof a resource does not exist |
| HTTP 429 | `rate_limited` |
| Session generation changed | `session_changed`; discard old data |
| Server/network/protocol failure | `server_or_network_error`; no raw credential-bearing exception is returned |
| Name absent from current native catalog | `TOOL_NOT_IN_CURRENT_CATALOG`; invocation not started, no fallback |
| Native tool returns an error | `tool_reported_error`; inspect the inner receipt for the server's specific sharing, confirmation, capability or offline-machine reason; do not invent a cause from a catalog count |
| Invocation transport outcome unknown | `execution: unconfirmed`, `retried: false`; inspect original receipt before retry |
| Remote machine attempts caller-session Vera tools | `VERIFIED_CALLER_SESSION_REQUIRED`; use the original authenticated caller's bridge |

Catalog discovery is not an online/heartbeat check for a specific computer. Discover and inspect the exact authorized environment/machine before executing anything. Native non-text result types are reported, not claimed to have been read/rendered.

## Remote identity boundary

Remote runners do not advertise or dispatch `VeraMcpListTools`, `VeraMcpCallTool` or own-user audit access using their machine owner's Vera login. The invoking user must use the caller-side bridge, then explicitly select the authorized remote target. Existing remote directory, approval and capability restrictions are unchanged. This does not revoke Git/SSH credentials from a remote OS account or make an arbitrary shell a security sandbox.

## Adoption and validation

Rebuild/reload Cowork to mount the new tool schemas; compilation does not hot-replace an already-running App Server conversation's tool catalog. No backend permission grants, stored key changes, mod installation or machine execution are required merely to expose discovery.

Fixture tests: `node --test test/vera-native-discovery.test.mjs test/vera-mcp-discovery.test.mjs test/remote-runner-catalog.test.mjs`; Electron compile: `bun run transpile:electron`. Live native discovery and exact-machine access remain separate verification states. The bundled/canonical vera-mcp skill's older Desktop-only connector instructions need alignment in a separately reviewed skill update; until then follow these current schemas rather than treating connector search as a remote inventory.
