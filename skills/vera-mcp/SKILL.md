---
name: vera-mcp
metadata:
  version: "1.1.0"
description: Uses Vera's native MCP tools for authenticated identity, channels, live Zoho email search and body/attachment reads, schedules, knowledge search, and secure organization-agent delegation. Trigger for Vera identity, workspace channels, live mailbox evidence, email bodies or attachments, schedule history, Vera knowledge retrieval, organization-agent access, configured-MCP routing, or Vera-mod installation/connection help.
---

# Vera Native MCP

Prefer Vera-native tools already mounted by the Vera mod or current runtime. When they are not mounted, call the native MCP endpoint through the bundled `scripts/call-mcp.mjs` fallback. Use the fallback only for its supported native subset and matching authenticated endpoint when tools are genuinely not mounted—not to bypass denial or missing grants. Never replace a denied operation with raw HTTP/database access or another principal/connector. Vera applies the authenticated user's organization, ownership, sharing, and knowledge ACL boundaries.

The fallback client re-reads the current Cowork session from `~/.letta-cowork/cowork.env` first, then uses `COWORK_TOKEN`, and uses standalone `VERA_TOKEN` only as a final fallback. It never accepts a token as an argument. Its endpoint is bound to the selected session server; `VERA_MCP_URL` must match that origin and native `/mcp` path. HTTPS is required except explicit loopback development. Redirects are rejected; bounded response reads stay under the request deadline. Never print, echo, log, or ask the user to paste a token in chat.

## Connection and Vera mod setup

First identify the runtime: Vera web, Cowork desktop, Letta Code with the Vera mod, or a server/channel/MCP-only session. Missing mod, missing authentication, denied resource access and offline machines are different states. Do not tell every unauthenticated user to install a mod; preserve an existing working installation/session.

For an actual Letta Code integration request or a missing mod, follow [Vera mod setup](references/vera-mod-setup.md): use an approved accessible package, obtain installation approval, verify compatible CLI/package identity, install locally, reload, then connect through the protected browser flow and verify authorized discovery. The active mod's `MOD.md` is authoritative. No tokens, passwords or OTP codes in chat, prompts, URLs or logs. Web users should sign in through their approved Vera interface, not CLI commands. A user without a Vera account/workspace must use an approved invitation/account workflow; installing a mod grants no membership or guest access.

## Calling a tool

If the exact `vera_*` tool is mounted, call it directly using its exposed schema. With the Letta Code Vera mod, use `vera_mcp_list_tools` to discover an unknown native tool and `vera_mcp_call_tool` to invoke it. Native tools can be namespaced by a legitimate runtime/transport. Identify origin, active principal/server and exposed schema from trusted discovery, not the prefix alone; use the exact returned name. Do not substitute an unrelated connector or change principal to bypass native email access.

If native tools are not mounted, resolve the fallback script relative to this `SKILL.md`. For the documented global installation, the path is:

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

## Fallback allowlist — not the full native catalog

The table below lists only the helper's intentionally limited subset. Current servers may expose additional capabilities through the mod/mounted runtime: email drafts; channel lifecycle/send/sharing; schedule mutations; profile sharing; remote environments/execution; MCP configuration; installed/trusted skills; contacts and response/delegation tools. Discover them with exact current schemas; don't infer absence from this table or add writes/arbitrary tools to the helper.

Use [capability routing and receipts](references/capability-routing.md) for those workflows, approved mutations, stop semantics, doc-search versus indexed knowledge, and failure handling. Schemas/grants remain authoritative and no tool visibility authorizes business effects.

| Tool | Use |
| --- | --- |
| `vera_whoami` | Return the authenticated Vera user, organization, and roles. |
| `vera_list_channels` | List sanitized channels visible to the current user. |
| `vera_get_channel_status` | Get sanitized metadata and process-local runtime status for one visible channel. |
| `vera_list_zoho_mail_read_operations` | Discover additional governed Zoho GET operations. |
| `vera_describe_zoho_mail_read_operation` | Read the parameters for one discovered Zoho operation. |
| `vera_call_zoho_mail_read` | Execute one allowlisted Zoho read operation with server-held credentials. |
| `vera_list_email_accounts` | List accounts for a visible authorized email channel. |
| `vera_list_email_folders` | List folders for a verified channel/account. |
| `vera_list_emails` | Read a bounded metadata page from one folder. |
| `vera_search_emails` | Search the live mailbox using Zoho syntax. |
| `vera_get_email` | Fetch one verified message's full body/content. |
| `vera_list_email_attachments` | List attachment metadata for one verified message. |
| `vera_get_email_attachment` | Download with a listed scoped attachmentRef only, or complete supported legacy input. |
| `vera_read_artifact` | Read bounded authorized artifact bytes when exposed; verify continuation, size and hash before inspection. |
| `vera_list_schedules` | List schedules owned by the current user. |
| `vera_get_schedule` | Read one owned schedule by UUID. |
| `vera_list_schedule_runs` | Read a bounded page of run history for one owned schedule. |
| `vera_search_knowledge` | Search only knowledge documents allowed by Vera's ACL. |
| `vera_list_accessible_organization_agents` | List organization agents published to the current Vera member. |
| `vera_send_message_to_organization_agent` | Send one bounded request to a verified published agent. |

The fallback client accepts only these exact tool names; do not add an MCP client prefix. Mounted runtimes may expose additional current tools.

Email reads and knowledge queries are read-only and do not mark messages read. Organization-agent delegation is non-idempotent and may perform open-world model work, so use it only when requested.

## Context and result discipline

Reuse supplied source content and already verified task/channel/account/folder/message IDs; refresh only a missing/stale required fact or changed principal/workspace. Do not restart an identified email task with “which email?” during recovery. Tool invocation remains responsible for current access checks; supplied IDs are lookup inputs, not authority.

Interpret MCP envelope **and inner data**: failure, denied access, partial/truncated coverage, no match and outcome unknown are different. A zero helper exit or discovered tool/catalog count is not proof of a completed action, file inspection, delivery or readiness. Show compact permitted evidence/receipt only for what was actually established; never expose secrets or confidential source details to unauthorized users. Read-only lookup, draft text generation, draft persistence, notification, send, remote command and future scheduled action have separate authorization/result gates. No business writes from generic approval or old history; email remains draft-only.

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

## Live email workflow

1. Call `vera_list_channels` and select a visible channel whose provider is `email`.
2. Resolve the account with `vera_list_email_accounts` and the folder with `vera_list_email_folders` only when those IDs are not already known.
3. Use `vera_list_emails` for a bounded page or `vera_search_emails` for a live query. Search supports Zoho forms such as `sender: user@example.com`, `subject: invoice::has:attachment`, `content: requested parts`, and `entire: company name`.
4. Treat list/search results as metadata discovery. Call `vera_get_email` with the required accessible `channelId` and returned `messageId`, plus verified `accountId`/`folderId` where supplied or necessary to read body/content. Never claim an email was reviewed from its subject or snippet alone.
5. Call `vera_list_email_attachments` for the verified same-source email. Current native listings return **`attachmentRef`**, not raw provider attachment IDs. For each material file call `vera_get_email_attachment` with **`{"attachmentRef":"<returned-reference>"}` only**; do not combine it with channel/message/account/folder/raw attachment fields. The server binds exact source context and rechecks access. References expire after 15 minutes and can be unavailable after restart/eviction/replica changes: re-list the same authorized email, never guess/unmask IDs or use raw credentials/endpoints as fallback.
6. A successful download returns inline bytes or an authenticated artifact; **downloaded does not mean inspected**. Use the currently exposed supported file/artifact reader, validate completeness, then inspect actual PDF/image content. If `vera_read_artifact` is advertised, use its exact artifactId/offset/maxBytes schema and continuation/size/hash verification. Prefer a supported file-aware mod download route when available instead of copying base64 into model context. If artifact reading/local inspection is unavailable, report that specific gate. Do not claim an unreadable file or failed download when retrieval/reader execution was never attempted; keep per-file listed/attempted/downloaded/inspected states and retain the current email task.
7. Record channel/account/folder, search predicates, candidate count, bodies successfully read, coverage dates, and attachment failures. Summarize; do not reproduce raw mailbox dumps.
8. For broader safe Zoho GET coverage, list an operation, describe its schema, then call it through `vera_call_zoho_mail_read`. Do not guess paths or methods.

Every call revalidates channel visibility and email access. Vera keeps Zoho credentials server-side, and live reads do not mark messages read. `vera_search_knowledge` can supplement indexed history but does not replace `vera_get_email` when source-body review is required.

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
- `sources`: optional currently discovered source enum; the verified catalog includes `email`, `whatsapp`, `whatsapp_business`, `wechat`, `telegram`, `discord`, `slack`, `zoho`, `manual`, and `other`; verify the actual schema/version before filtering;
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

1. Call `vera_list_accessible_organization_agents` with `scope: "all"`; never guess or reuse an ID from another user or organization.
2. Select an agent from the returned directory and preserve its exact `publicationId`.
3. Call `vera_send_message_to_organization_agent` with that ID and a complete bounded message.
4. Treat each call as a fresh isolated conversation and report the returned result and limitations.

## Configured Odoo MCP — routing only

Vera's dedicated `/odoo/*` REST adapter, built-in Odoo services/tools and global Odoo credential fallback are retired. ERP access requires an explicitly configured **visible, enabled MCP connector** and enabled discovered tools, within the current organization/user/profile scope and upstream permissions. No connector/grant means no access through this workflow.

With an active Vera mod, discover `area: "configured_connectors"`, query `Odoo`, and `includeSchemas: true`; invoke only exact returned names/schemas through `vera_mcp_call_tool`. Other runtimes use their exposed scoped MCP discovery/invocation gateway. Fetch current models/argument conventions from actual authorized schemas; do not assume legacy direct names, global endpoints, AND-only domains, JSON-string method args or caller-supplied context. Do not use Bash/curl/scripts, another user's connection or the native fallback helper to bypass missing ERP access. Read/write classification and human business authority remain separate from tool visibility.

### Configured discovery and stale names

Desktop uses VeraMcpListTools (empty args list visible connectors), then an exact selected serverSlug plus query to get enabled schemas; VeraMcpCallTool takes the exact returned namespaced toolName. The mod uses vera_mcp_list_tools with area=configured_connectors and includeSchemas=true, then vera_mcp_call_tool. Native McpFetchTools/McpInvokeTool instead uses serverSlug plus returned nativeName for invocation. Use only fields actually exposed in that runtime's schema.

Where supported, searchAllConnectors:true searches the authorized visible catalog; do not combine it with serverSlug. Namespaced search input is normalized for discovery only. Unavailable connectors/tools can return actual suggestedTools/schemas; confirm the intended account/environment even if one suggestion exists. Execution is never silently redirected, and absence of an old slug is not proof no visible connector exposes Odoo. Read truncation/nextOffset metadata. Do not repeat a stale invocation, invent a replacement namespace or bypass a revoked grant. Query/transport/permission failures are distinct; once dispatched, an uncertain operation must not be blindly replayed.

`scripts/call-mcp.mjs` is for its allowlisted **native Vera** tools only; it is not an Odoo/configured-connector proxy. Do not send a namespaced ERP tool to it or add arbitrary tools to its list. For actual business procedures use the applicable current skill and approved company/document evidence, not this routing paragraph as authority for records or writes.

## Tool selection

- Identity or workspace mismatch → `vera_whoami`
- What channels can I access? → `vera_list_channels`
- Is this channel running? → list, resolve UUID, then `vera_get_channel_status`
- Search live email → resolve channel/account/folder, then `vera_search_emails`
- Read an email body → search/list first, then `vera_get_email` with all returned IDs
- Inspect an email attachment → list attachments first, then retrieve the verified attachment
- What schedules do I own? → `vera_list_schedules`
- Show one schedule → list/verify, then `vera_get_schedule`
- Did a scheduled task run? → list/verify, then `vera_list_schedule_runs`
- Find indexed internal context → `vera_search_knowledge`
- Ask an organization agent → list published agents first, then send once

Do not use this skill for:

- Neo4j queries; use `neo4j-mcp`;
- Odoo business procedures; use the configured-MCP routing above and a current authorized domain skill, never retired direct adapters;
- channel or schedule writes through the fallback helper; use only mounted current tools and explicit authorization when such writes are requested;
- sending email. Agents may read authorized email and prepare drafts, but must never transmit email.

## Error handling

- **No Cowork-managed or standalone Vera token:** choose the correct runtime's protected login path; use the mod setup reference only for Letta Code. Never request token plaintext in chat or install/reconnect blindly.
- **401:** identify an actual authentication/session error and use the approved same-principal/server recovery path. Never ask for a secret in chat.
- **403 / ownership/sharing denial:** report the actual permission/asset restriction. Reconnecting or installing a mod does not grant access; do not retry through another route or account.
- **Client script missing:** report an incomplete skill package; recover the complete approved directory only with installation authorization, not an unrelated token/API workaround.
- **Endpoint unreachable:** report the connection failure; do not expose the token while troubleshooting.
- **Email channel/account/folder unavailable:** report the exact unavailable scope. Do not substitute metadata from another user or channel.
- **Email body empty, truncated, or failed:** record the message as not successfully read and keep the email layer incomplete.
- **No relevant email matches:** report the searched scope and predicates; do not claim the underlying correspondence never existed.
- **Resource not found:** refresh the relevant list and verify the ID; do not bypass ACLs with another API.
- **Truncated response:** narrow the search or date range, or paginate.
- **Write requested:** use only an approved mounted workflow with explicit authorization; never send email.

## Connection reference

The fallback client calls the stateless Streamable HTTP endpoint at `POST /mcp` using the current authenticated Cowork user or standalone Vera token. Personal MCP tokens are user-owned, expiring, revocable, and accepted only on approved MCP routes; Cowork tokens retain the acting user's Vera scope. Never place token plaintext in skill files, source code, logs, screenshots, or chat.
