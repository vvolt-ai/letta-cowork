# Read your own Vera audit events

Cowork exposes `SafetyAuditListOwn` as a local read-only tool, backed by the existing authenticated `GET /safety-audit-events/me` endpoint. Rebuild/restart Cowork after updating so the tool appears in newly loaded SDK tool catalogs. This does not add a native MCP tool or change the server's existing server-hosted agent reader.

Example:

```json
{"status":"failed","toolName":"Bash","pageSize":10,"from":"2026-10-23T00:00:00Z"}
```

Filters: `page`, `pageSize` (1–25), `source`, `eventType`, `severity`, `category`, `status`, `channelId`, `conversationId`, `agentId`, `toolName`, `from`, `to`. Times require ISO8601 timestamps with a timezone. These are structured filters, not an unrestricted database/full-text query.

## Scope and safety

- Requires the signed-in Cowork Vera user and organization. The server derives scope from that JWT; model arguments cannot choose a user/organization or admin endpoint.
- Uses the protected current API session, HTTPS (except loopback development), no redirects, a20-second body-inclusive deadline and a256KiB response limit. Login/organization/server changes during a read discard the result.
- Permission/HTTP failures do not switch identity, call admin APIs or fall back to a shared machine owner's login.
- The tool is not advertised by remote runners, and remote dispatch explicitly rejects it. Invoke it in the caller's own Cowork session, not through `run_remote_tool`.
- Existing standard/strict/Full Access choices remain; audit listing is classified read-only.
- Results expose selected audit fields, not arbitrary raw `content` fields. Failed tool stdout/stderr may be deliberately omitted by Vera's retention/redaction policy. System events with no matching user/organization are not returned.
- Local `LogSearch` still searches a file; `ToolTraceSearch` still searches local client execution traces. Neither is the server database audit reader.

No shipment/business records, log-retention settings, roles or access grants are changed by this feature. Broader platform diagnostics or native MCP exposure require separate design/authorization rather than widening this own-user endpoint.
