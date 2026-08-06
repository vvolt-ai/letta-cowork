---
name: vera-mcp
description: Use Vera's native read-only MCP tools for authenticated identity, visible communication channels, channel runtime status, owned schedules and run history, and ACL-filtered Vera knowledge search. Trigger for Vera identity, workspace channels, schedule status/history, or Vera knowledge retrieval.
---

# Vera Native MCP

Use the mounted Vera MCP tools directly. These tools are the preferred path for the supported Vera operations because the server applies the authenticated user's organization, ownership, sharing, and knowledge ACL boundaries.

Do not use Bash, `curl`, raw database access, or internal REST routes when the corresponding Vera MCP tool is available.

## Available tools

| Tool | Use |
| --- | --- |
| `vera_whoami` | Return the authenticated Vera user, organization, and roles. |
| `vera_list_channels` | List sanitized channels visible to the current user. |
| `vera_get_channel_status` | Get sanitized metadata and process-local runtime status for one visible channel. |
| `vera_list_schedules` | List schedules owned by the current user. |
| `vera_get_schedule` | Read one owned schedule by UUID. |
| `vera_list_schedule_runs` | Read a bounded page of run history for one owned schedule. |
| `vera_search_knowledge` | Search only knowledge documents allowed by Vera's ACL. |

If the MCP client prefixes tool names, use the discovered tool whose name ends with the exact name above.

All current Vera-native tools are read-only.

## Identity workflow

Call `vera_whoami` when:

- the user asks which Vera identity or workspace is active;
- a resource appears to be missing unexpectedly;
- organization or role context affects the answer; or
- you are validating a newly attached MCP connection.

Do not call it before every operation when the current identity is already established.

Never infer access to another organization from names, prior conversations, or another user's results.

## Channel workflow

1. Call `vera_list_channels` with `ownedOnly: false` for all visible channels.
2. Use `ownedOnly: true` only when the user specifically asks for channels they created or own.
3. Match channels using returned IDs and metadata.
4. Call `vera_get_channel_status` with the verified channel UUID for runtime details.

Channel responses are sanitized and do not include provider credentials. Runtime status is process-local: report it as the current Vera server process's view, not as proof of external provider health.

Example arguments:

```json
{ "ownedOnly": false }
```

```json
{ "channelId": "11111111-1111-4111-8111-111111111111" }
```

## Schedule workflow

1. Call `vera_list_schedules` to identify the schedule and its UUID.
2. Call `vera_get_schedule` for the selected schedule's details.
3. Call `vera_list_schedule_runs` for execution history.
4. Use a small `limit` first and increase only when needed. Valid limits are 1–50; offsets are bounded.

Example run-history arguments:

```json
{
  "scheduleId": "22222222-2222-4222-8222-222222222222",
  "limit": 20,
  "offset": 0
}
```

These tools expose schedules owned by the authenticated user. An absent schedule is not evidence that it does not exist for another user.

## Knowledge search workflow

Use `vera_search_knowledge` for content already indexed in Vera's authorized knowledge store.

Arguments:

- `query`: required, 1–2,000 characters;
- `sources`: optional subset of `email`, `whatsapp`, `whatsapp_business`, `wechat`, `telegram`, `discord`, `slack`, `zoho`, `manual`, or `other`;
- `from` / `to`: optional ISO 8601 timestamps with offsets;
- `limit`: 1–50, default 10;
- `mode`: `keyword` or `hybrid`.

Guidance:

- Start with `keyword` for exact names, identifiers, quoted phrases, order numbers, or error strings.
- Use `hybrid` for conceptual or semantic questions when available.
- Apply source and date filters when the request supplies them.
- Start with 10 results or fewer; broaden only if needed.
- Treat no results as "no authorized indexed match found," not proof that the underlying event never happened.
- Cite or identify the returned source/date metadata when making factual claims.

Example arguments:

```json
{
  "query": "Neo4j access permission",
  "sources": ["slack", "email"],
  "limit": 10,
  "mode": "hybrid"
}
```

## Tool selection

- Identity or workspace mismatch → `vera_whoami`
- What channels can I access? → `vera_list_channels`
- Is this channel running? → list, resolve UUID, then `vera_get_channel_status`
- What schedules do I own? → `vera_list_schedules`
- Show one schedule → list/verify, then `vera_get_schedule`
- Did a scheduled task run? → list/verify, then `vera_list_schedule_runs`
- Find indexed internal context → `vera_search_knowledge`

Do not use this skill for:

- Neo4j queries; use `neo4j-mcp`;
- Odoo lookups; use direct mounted Odoo tools when available;
- creating, updating, deleting, starting, or stopping channels or schedules—the native Vera MCP catalog does not expose those writes;
- sending email. Agents may draft email content but must never send it.

## Error handling

- **401 or unavailable tools:** ask the user to refresh or reattach the Vera MCP server. Never ask them to paste a token into chat.
- **Resource not found:** refresh the relevant list and verify the UUID; do not bypass ACLs with another API.
- **Empty knowledge results:** refine the query or filters and clearly state the authorized search found no match.
- **Truncated response:** narrow the search, lower the time range, or paginate schedule runs.
- **Write requested:** explain that the native catalog is read-only and use an approved write workflow only if one exists and the user has authority.

## Connection reference

The native endpoint is stateless Streamable HTTP at `POST /mcp`. It accepts a Vera user token or personal Vera MCP token. Personal MCP tokens are user-owned, expiring, revocable, and accepted only on approved MCP routes; they are not general Vera REST credentials. Never place token plaintext in skill files, source code, logs, screenshots, or chat.
