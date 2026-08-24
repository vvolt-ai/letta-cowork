---
name: vera-mcp
description: Uses Vera's native MCP tools for authenticated identity, visible communication channels, schedules and run history, ACL-filtered knowledge search, and secure delegation to organization Letta agents. Trigger for Vera identity, workspace channels, schedule status/history, Vera knowledge retrieval, organization-agent discovery, or delegation.
---

# Vera Native MCP

This skill is self-contained. Call Vera's native MCP endpoint through the bundled `scripts/call-mcp.mjs` client; do not look for, add, mount, refresh, or attach MCP server tools. Vera applies the authenticated user's organization, ownership, sharing, and knowledge ACL boundaries.

The client reads the current agent's `VERA_TOKEN` environment secret and never accepts a token as an argument. It uses `VERA_MCP_URL` when set, otherwise `/mcp` under `VERA_SERVER_URL` or `COWORK_SERVER_URL`, and finally the published Vera server default. Never print, echo, log, or ask the user to paste the token in chat.

## Calling a tool

Resolve the script relative to this `SKILL.md`. For the documented global installation, the path is:

```bash
node "$HOME/.letta/skills/vera-mcp/scripts/call-mcp.mjs" <tool-name> <<'JSON'
{ "argument": "value" }
JSON
```

Pass exactly one allowed tool name as the command argument and one JSON object on standard input. Use `{}` for tools with no arguments. Do not put JSON or secrets in command-line arguments. Treat the script's standard output as the MCP tool result and a nonzero exit as failure.

Example:

```bash
node "$HOME/.letta/skills/vera-mcp/scripts/call-mcp.mjs" vera_whoami <<'JSON'
{}
JSON
```

Using Bash solely to run this bundled client is the intended workflow. Do not replace it with `curl`, raw database access, or internal REST routes.

If this skill was installed somewhere other than `~/.letta/skills/vera-mcp`, use the actual directory containing this file as the base path.

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
| `vera_list_organization_agents` | List owned/shared Letta agents available through the current Vera organization. |
| `vera_delegate_to_organization_agent` | Run one isolated task on a listed organization agent. |

The bundled client accepts only these exact tool names; do not add an MCP client prefix.

All tools except delegation are read-only. Delegation is non-idempotent and may perform open-world model work, so use it only when the user requested the work. Vera keeps organization credentials server-side and does not grant the delegated run server-local Bash or filesystem client tools.

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

## Organization-agent delegation workflow

1. Call `vera_list_organization_agents`; never guess or reuse an ID from another user or organization.
2. Select an agent from the returned current directory.
3. Call `vera_delegate_to_organization_agent` with `agentId`, a short `description`, and a complete `prompt`.
4. Treat each call as a fresh isolated conversation. Include all required context in the prompt.
5. Report the returned final result and any clearly stated limitations.

Delegation prompt length is capped at 20,000 characters. It does not expose the organization token or provide server-local client tools to the target agent.

## Tool selection

- Identity or workspace mismatch → `vera_whoami`
- What channels can I access? → `vera_list_channels`
- Is this channel running? → list, resolve UUID, then `vera_get_channel_status`
- What schedules do I own? → `vera_list_schedules`
- Show one schedule → list/verify, then `vera_get_schedule`
- Did a scheduled task run? → list/verify, then `vera_list_schedule_runs`
- Find indexed internal context → `vera_search_knowledge`
- Which organization agents can I use? → `vera_list_organization_agents`
- Ask an organization agent to complete a task → list first, then `vera_delegate_to_organization_agent`

Do not use this skill for:

- Neo4j queries; use `neo4j-mcp`;
- Odoo lookups; use direct mounted Odoo tools when available;
- creating, updating, deleting, starting, or stopping channels or schedules—the native Vera MCP catalog does not expose those writes;
- sending email. Agents may draft email content but must never send it.

## Error handling

- **`VERA_TOKEN` unavailable:** tell the user to run `/secret set VERA_TOKEN ...` for the current Letta Code agent and start a new session. Never request the token in chat.
- **401/403:** report that the saved token is invalid, expired, revoked, or lacks access. Do not retry through another route.
- **Client script missing:** the skill package is incomplete; reinstall the whole skill directory, including `scripts/call-mcp.mjs`. Do not attach an MCP server as a workaround.
- **Endpoint unreachable:** report the connection failure. Use the configured Vera server URL when provided; do not expose the token while troubleshooting.
- **Resource not found:** refresh the relevant list and verify the UUID; do not bypass ACLs with another API.
- **Empty knowledge results:** refine the query or filters and clearly state the authorized search found no match.
- **Truncated response:** narrow the search, lower the time range, or paginate schedule runs.
- **Write requested:** only organization-agent delegation is exposed as a non-read operation. For other writes, use an approved workflow only when the user has authority.

## Connection reference

The bundled client calls the stateless Streamable HTTP endpoint at `POST /mcp` using the current agent's `VERA_TOKEN`. Personal MCP tokens are user-owned, expiring, revocable, and accepted only on approved MCP routes; they are not general Vera REST credentials. Never place token plaintext in skill files, source code, logs, screenshots, or chat.
