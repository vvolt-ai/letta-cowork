# Vera for Letta Code

Native Letta Code package for user-scoped Vera authentication, MCP tool access, and messaging-channel access. It is a Letta Code mod, not a separate runtime or fork.

## Current vertical slice

- Browser OAuth authorization-code login with PKCE and a loopback callback
- Optional email OTP fallback using Vera's existing `/auth/otp/*` endpoints
- Automatic reuse of a signed-in Vera Cowork session from `~/.letta-cowork/cowork.env`
- OAuth/OTP refresh-token rotation, revocation, and logout
- Full Vera MCP, governed Neo4j MCP, and configured-connector discovery and invocation through the dynamic bridge
- Browser-approved Master Clio enrollment with a narrow scope and Ed25519 request assertions
- Accessible channel listing and message history
- Same- and cross-organization shared-agent discovery and approval-gated delegation
- Approval-gated non-email text and file sending
- Every Vera-advertised MCP tool is callable behind Letta Code approval; the dedicated channel-send helper still excludes email to prevent bypassing MCP tool-level review
- No Vera/provider credentials exposed to the agent

Native inbound channel routing is intentionally not implemented by polling message logs. It requires a Vera event stream plus exclusive delivery ownership; see [Inbound channel follow-up](#inbound-channel-follow-up).

## Install locally

```bash
cd /path/to/letta-code-vera
letta install .
```

Reload an already-running Letta Code session:

```text
/reload
```

The package requires Letta Code CLI or Desktop `>=0.28.0`. Check with `letta --version`; older CLIs do not expose `letta install`.

## Connect

The default Vera server is `https://vera-cowork-server.ngrok.app`. The mod normalizes the trailing slash and keeps this as the persistent default unless an explicit managed deployment overrides it.

### Reuse an existing Cowork login

When Vera Cowork is signed in, the mod automatically reads the current access
token from:

```text
~/.letta-cowork/cowork.env
```

The file is read again for every Vera request, so access-token rotation by
Cowork does not require restarting Letta Code. The file takes precedence over
the process-level `COWORK_TOKEN`, which may be stale in an already-running
Letta Code process. The Cowork token is not copied into the mod's connection
state, and `/vera-disconnect` does not revoke or delete the Cowork session.

If Cowork uses a server other than the mod's configured server, select it once:

```text
/vera-connect --server https://vera.example.com
```

Managed installations can override the Cowork environment-file location with
`VERA_COWORK_ENV_PATH`. `VERA_COWORK_API_URL` supplies the matching server URL
when it is available in the Letta Code process environment.

### Browser OAuth login

Run `/vera-connect` while disconnected. The mod dynamically registers a public PKCE client, opens Vera in the system browser, and receives the authorization code on a temporary `127.0.0.1` callback. The OAuth tokens remain in owner-only local state and are never exposed to the agent.

```text
/vera-connect
/vera-connect --server https://vera-cowork-server.ngrok.app browser
```

On Windows, the mod launches the complete authorization URL directly through the system URL handler. Version `0.5.1` fixes the older `cmd /c start` path that could truncate the query at the first `&`, causing Vera to report a missing `client_id`.

Email OTP remains available as a non-browser fallback:

```text
/vera-connect user@verivolt.com
/vera-connect 123456
```

Other commands:

```text
/vera-status
/vera-sync
/vera-tools [filter]
/vera-master-enroll [device name]
/vera-master-status
/vera-disconnect
```

`/vera-connect` is excluded from the conversation transcript. Browser OAuth is the default standalone flow; terminal OTP remains a compatibility fallback. `/vera-master-enroll` separately requests the narrow `vera:master-enroll` browser scope, uses it once, and revokes its enrollment tokens.

### OTP troubleshooting

Vera's OTP request endpoint is enumeration-safe: an accepted response does not prove that the email belongs to an active Vera user or that mail was delivered. If no code arrives, verify that the user is active, has an active organization membership, and that the deployed server has working `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` settings. When `SMTP_HOST` is absent, the current Vera development fallback logs the OTP server-side instead of sending mail.

## Agent operating guide

[`MOD.md`](./MOD.md) is the bundled agent-facing source of truth for every Vera capability. The mod does not depend on a separately installed `vera-mcp` skill.

For any server-side capability, agents discover a focused area before invoking a tool:

```json
{"area":"email","includeSchemas":true}
{"area":"channels","includeSchemas":true}
{"area":"remote","includeSchemas":true}
{"area":"knowledge_graph","includeSchemas":true}
{"area":"shared_agents","includeSchemas":true}
{"area":"schedules","includeSchemas":true}
{"area":"configured_connectors","query":"salesforce","includeSchemas":true}
```

`vera_mcp_list_tools` returns exact tool names, schemas, and area-specific workflow guidance. `vera_mcp_call_tool` must receive an exact returned name and schema-matching arguments.

Key retrieval paths:

- **Live email:** email channel → account → folder → bounded list/search → exact body → attachments. Email is read/draft-only.
- **Channels:** list → exact channel status → requested lifecycle/share/send operation. Sending is non-idempotent and email channels are blocked.
- **Remote access:** environments → exact environment → online machines → verify capability and allowed directories → confirmed remote tool call.
- **Knowledge graphs:** visible instances → exact slug and permissions → schema → bounded parameterized read/explain → explicitly authorized write only when access permits it.
- **Shared agents:** accessible publication directory → verify publisher, grant scope, and current publication ID → send one complete task → wait for the isolated conversation's final reply.
- **Configured connectors:** discover the exact namespaced connector tool and schema; credentials remain on Vera Server.
- **Knowledge:** use authorized indexed search for historical cross-channel context, not as a substitute for live mailbox or runtime state.

Natural discovery queries such as `email data`, `remote access`, `channel messages`, and `shared agents` are expanded to relevant aliases, but an explicit `area` is preferred.

Agent sharing is directional: the publishing organization owns the agent and grant, while the target organization/member receives discovery and messaging access. Normal users can contact only agents currently shared with them. Grant creation/edit/removal remains an administrator operation in Vera web under **Organization settings → AI & messaging → Agent sharing**; it is not exposed as an MCP/mod mutation tool. Profile sharing with an `agents` scope is a separate resource-sharing mechanism and does not publish an organization agent.

## Agent tools

| Tool                                         | Behavior                                                                                                                            | Approval    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `vera_mcp_list_tools`                        | Guided discovery by capability area or natural query; returns exact tools, optional schemas, and workflow guidance                  | Automatic   |
| `vera_mcp_call_tool`                         | Invoke one exact discovered Vera-native or configured-connector MCP tool with schema-matching arguments                             | Always asks |
| `vera_list_accessible_organization_agents`   | List same- and cross-organization agents currently shared with the user, including publisher, grant scope, and exact publication ID | Automatic   |
| `vera_send_message_to_organization_agent`    | Send one complete task to a current publication and wait for the isolated conversation's final reply                                | Always asks |
| `vera_list_organization_agents`              | Compatibility alias that lists the same publication directory                                                                       | Automatic   |
| `vera_delegate_to_organization_agent`        | Compatibility alias that resolves an agent ID against the current directory before sending                                          | Always asks |
| `vera_master_list_accessible_organizations`  | List organization grants for the exact enrolled runtime agent; hidden from non-Master agents                                        | Automatic   |
| `vera_master_list_organization_agents`       | List grant-filtered agents in one accessible organization                                                                           | Automatic   |
| `vera_master_get_organization_agent`         | Read one grant-scoped organization agent                                                                                            | Automatic   |
| `vera_master_create_organization_agent`      | Create an agent under an organization-wide `agents.manage` grant                                                                    | Always asks |
| `vera_master_update_organization_agent`      | Update an approved agent with optimistic concurrency                                                                                | Always asks |
| `vera_master_delete_organization_agent`      | Permanently delete an approved agent with optimistic concurrency                                                                    | Always asks |
| `vera_master_get_agent_instructions`         | Read system instructions and their concurrency hash                                                                                 | Automatic   |
| `vera_master_update_agent_instructions`      | Update system instructions while preserving protected marked layers                                                                 | Always asks |
| `vera_master_create_agent_memory_block` | Create and attach a new block under target `agents.manage`; duplicate labels are refused and target version is checked | Always asks |
| `vera_master_attach_agent_memory_block` | Attach a block proven on an approved same-organization source; target `agents.manage` plus source `memory.read` required | Always asks |
| `vera_master_list_agent_memory`              | List approved-agent core-memory blocks                                                                                              | Automatic   |
| `vera_master_get_agent_memory_block`         | Read one core-memory block and its concurrency hash                                                                                 | Automatic   |
| `vera_master_update_agent_memory_block`      | Update one core-memory block with optimistic concurrency                                                                            | Always asks |
| `vera_master_git_read`                       | Run grant-scoped read-only Git operations                                                                                           | Automatic   |
| `vera_master_git_write`                      | Run grant-scoped mutating Git operations                                                                                            | Always asks |
| `vera_master_delegate_to_organization_agent` | Delegate through a new isolated Letta conversation                                                                                  | Always asks |
| `vera_channels_list`                         | List basic owned/shared channel metadata; use MCP discovery for full status/lifecycle/sharing                                       | Automatic   |
| `vera_channel_history`                       | Read bounded channel delivery logs; not a live mailbox-body API                                                                     | Automatic   |
| `vera_channel_send`                          | Send a non-email text message                                                                                                       | Always asks |
| `vera_channel_send_file`                     | Upload and send a local file through a non-email channel                                                                            | Always asks |

The generic MCP bridge avoids placing every Vera-native, Neo4j, or configured-connector schema in every model request. Discovery merges Vera's native Streamable HTTP catalog with the connector-centric catalog, then routes each invocation back to its owning endpoint. The agent first discovers the exact tool and then invokes it. Frequently used tools can be materialized as direct Letta tools in a later release.

The generic MCP bridge does not silently remove server-advertised capabilities, including email tools. Every generic invocation uses Letta Code's `ask` approval policy. The separate `vera_channel_send` and file-send helpers continue to reject email channels so they cannot bypass the generic MCP approval boundary.

Master tools are dynamically hidden unless `ctx.agent.id` exactly matches the locally enrolled Master Clio identity. Non-Master agents see only the normal user-authorized organization listing and delegation tools, preventing ambiguous organization-access requests from invoking the Master control plane. Every Master operation also requires a current Vera token with `userRole=super_admin`; an MCP token must carry `vera:mcp`. Vera binds challenge creation and exchange to the same super-admin user before issuing the operation-bound Master token.

### Master memory setup (mod 0.5.6)

Agent creation accepts optional `memoryBlocks: [{ label, value, description?, limit? }]` (up to 20 unique labels). They are passed as Letta `memory_blocks` in the same creation request, under the existing organization-wide `agents.manage` grant. A label has 1–120 ASCII letters, digits, dots, underscores or hyphens. Default block limit is 5000 characters; the value must fit its supplied limit.

For an existing approved agent, `vera_master_create_agent_memory_block` creates and attaches a new block. `vera_master_attach_agent_memory_block` shares an existing block by ID from a readable, allowlisted `sourceAgentId` in the same organization. Both require the target's current `expectedUpdatedAt`, confirmation and human approval. They return sanitized block metadata, not existing block values, and verify attachment by read-back. They do not replace conflicting labels or detach blocks.

Existing value edits remain gated by `memory.write` and a matching value hash; shared edits additionally check write access on every referenced agent. The current bounded reference check refuses lists of 100 or more. No live grants are expanded. Setup writes are serialized per target inside one server process; external Letta writers and multiple server workers are not covered by that lock. If creation succeeds but attachment fails or cannot be verified, the error includes the created block ID: inspect state through authorized administration before retrying. No automatic orphan-block deletion is performed.

These tools require the updated backend and an updated/reloaded mod; installing the mod alone does not deploy server support.

## Authentication and local state

For standalone browser OAuth or OTP login, connection state is stored at:

```text
~/.letta/vera/connection.json
```

The directory is set to mode `0700` and the file to mode `0600`. Override locations for tests or managed environments with:

```bash
VERA_LETTA_STATE_PATH=/secure/path/connection.json
```

Standalone OAuth or OTP access and refresh tokens are used only inside the trusted local mod. Tool arguments, tool results, and agent context do not contain them. `/vera-disconnect` revokes the appropriate standalone OAuth/OTP credential and removes local tokens. When Cowork authentication is active, Cowork remains the credential owner and logout must happen in Cowork.

Master Clio enrollment creates an Ed25519 key at `~/.letta/vera/master-identity.json`. The directory is mode `0700` and the file is mode `0600`; the private key is never included in tool arguments, results, or agent context. This is the development storage boundary. Production activation on shared machines requires a platform credential-store adapter or equivalent protected key storage.

## Vera API contracts used

```text
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/refresh
POST /auth/logout
GET  /auth/me

GET  /.well-known/oauth-authorization-server
POST /register
GET  /authorize
POST /token
POST /revoke

POST /mcp                  # Native Vera MCP tools/list and tools/call
POST /neo4j-mcp            # Governed Neo4j tools/list and tools/call
GET  /mcp/tools            # Namespaced configured-connector catalog
POST /mcp/tools/invoke     # Configured-connector invocation

GET  /channels/accessible
GET  /organization-agents
POST /organization-agents/delegate
POST /master-agent-auth/installations/enroll
GET  /master-agent-access/status
POST /master-agent-auth/challenges
POST /master-agent-auth/tokens/exchange
GET    /master-agent-access/organizations
GET    /master-agent-access/organizations/:organizationId/agents
POST   /master-agent-access/organizations/:organizationId/agents
POST   /master-agent-access/organizations/:organizationId/agents/:agentId/memory
POST   /master-agent-access/organizations/:organizationId/agents/:agentId/memory/attach
GET    /master-agent-access/organizations/:organizationId/agents/:agentId
PATCH  /master-agent-access/organizations/:organizationId/agents/:agentId
DELETE /master-agent-access/organizations/:organizationId/agents/:agentId
GET    /master-agent-access/organizations/:organizationId/agents/:agentId/instructions
PUT    /master-agent-access/organizations/:organizationId/agents/:agentId/instructions
GET    /master-agent-access/organizations/:organizationId/agents/:agentId/memory
GET    /master-agent-access/organizations/:organizationId/agents/:agentId/memory/:label
PUT    /master-agent-access/organizations/:organizationId/agents/:agentId/memory/:label
POST   /master-agent-access/organizations/:organizationId/repositories/:repositoryKey/git
POST   /master-agent-access/organizations/:organizationId/delegations

GET  /channels/:channelId/messages
POST /channels/:channelId/send
POST /channels/:channelId/send-file-upload
```

Normal MCP, Neo4j MCP, and channel endpoints use the browser/Cowork user's bearer token. Master Clio enrollment uses narrow browser approval; every later operation requires both the signed installation identity and the current super-admin Vera bearer token to mint an operation-bound short-lived token. Vera remains the authorization boundary in both cases.

## Inbound channel follow-up

The future native plugin belongs at:

```text
~/.letta/channels/vera/
```

It must not scrape or poll channel history. Before implementing it, Vera Server needs:

1. An authenticated WebSocket or SSE stream of normalized inbound channel events.
2. Installation registration and heartbeat for local Letta Code runtimes.
3. A claim/ack or cursor protocol so events are recoverable and deduplicated.
4. Explicit route ownership, such as `deliveryTarget=letta-code`, so Vera's server runtime and local Letta Code do not both answer.
5. Channel/thread/sender/policy metadata on every event.

Once available, the plugin will call `adapter.onMessage(...)` for inbound events and extend Letta Code's shared `MessageChannel` tool for replies through Vera.

## Development

```bash
bun test
bun --check mods/vera.js
```
