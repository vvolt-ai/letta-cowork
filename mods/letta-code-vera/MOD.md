# Vera mod

## Purpose and source of truth

This mod is the local Letta Code integration for Vera. It is the agent-facing source of truth for Vera authentication, native Vera MCP, governed Neo4j knowledge graphs, configured MCP connectors, messaging channels, remote environments, organization agents, and Master Clio operations. Do not depend on a separately installed `vera-mcp` skill.

Vera remains the authorization and credential boundary. The mod exposes tool schemas and sanitized results; provider credentials and Vera bearer/refresh tokens remain inside Cowork, Vera Server, or the trusted local mod.

When Vera Cowork is signed in, the mod reuses the current access token from `~/.letta-cowork/cowork.env` and reads it again for every request. Cowork remains the owner of that session. Browser OAuth authorization-code flow with PKCE is the primary standalone path; terminal email OTP is a fallback.

## Commands

- `/vera-connect [--server <url>] [browser|email|otp]`
- `/vera-status`
- `/vera-sync`
- `/vera-tools [filter]`
- `/vera-disconnect`
- `/vera-master-enroll [device name]`
- `/vera-master-status`

## Core operating rule

Use the smallest Vera tool path that fits the request:

1. For live email, full channel lifecycle/status/sharing, remote environments, knowledge graphs, schedules, indexed knowledge, profile sharing, configured MCP servers, server skills, and Vera response tools, call `vera_mcp_list_tools` first.
2. Select a capability `area` and set `includeSchemas: true` before invocation.
3. Use the exact returned tool name and schema with `vera_mcp_call_tool`; never guess names or parameters.
4. Use `vera_channels_list`, `vera_channel_history`, `vera_channel_send`, and `vera_channel_send_file` only for their dedicated basic channel operations.
5. Use the dedicated organization-agent tools instead of rediscovering the equivalent native MCP tools.
6. Treat an empty result as “no authorized visible match,” not proof that the resource does not exist.
7. Never bypass a Vera ownership, sharing, organization, role, capability, or workspace denial with raw HTTP, shell commands, or direct database access.

Example discovery calls:

```json
{"area":"email","includeSchemas":true}
{"area":"channels","includeSchemas":true}
{"area":"remote","includeSchemas":true}
{"area":"knowledge_graph","includeSchemas":true}
{"area":"shared_agents","includeSchemas":true}
{"area":"schedules","includeSchemas":true}
{"area":"configured_connectors","query":"salesforce","includeSchemas":true}
```

Natural queries such as `email data`, `remote access`, and `channel messages` are expanded by discovery, but an explicit `area` is preferred.

## MCP capability catalog

`vera_mcp_list_tools` merges Vera-native tools from authenticated `POST /mcp`, governed Neo4j tools from `POST /neo4j-mcp`, and namespaced configured-connector tools from `/mcp/tools`. Native Vera and Neo4j names may be returned unprefixed; configured connector tools are normally namespaced. Always call the exact returned name.

| Area                    | Vera-native tools                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `identity`              | `vera_whoami`                                                                                                                                                                                                                                                                                                                                    |
| `channels`              | `vera_list_channels`, `vera_get_channel_status`, `vera_create_channel`, `vera_update_channel`, `vera_start_channel`, `vera_stop_channel`, `vera_send_channel_message`, `vera_delete_channel`, `vera_list_channel_shares`, `vera_share_channel`, `vera_revoke_channel_share`                                                                      |
| `email`                 | `vera_list_zoho_mail_read_operations`, `vera_describe_zoho_mail_read_operation`, `vera_call_zoho_mail_read`, `vera_list_email_accounts`, `vera_list_email_folders`, `vera_list_emails`, `vera_search_emails`, `vera_get_email`, `vera_generate_email_draft`, `vera_save_email_draft`, `vera_list_email_attachments`, `vera_get_email_attachment`, `vera_read_artifact` |
| `responses`             | `vera_respond`                                                                                                                                                                                                                                                                                                                                   |
| `schedules`             | `vera_list_schedules`, `vera_get_schedule`, `vera_list_schedule_runs`, `vera_create_schedule`, `vera_update_schedule`, `vera_toggle_schedule`, `vera_delete_schedule`                                                                                                                                                                            |
| `knowledge`             | `vera_search_knowledge`                                                                                                                                                                                                                                                                                                                          |
| `knowledge_graph`       | `neo4j_list_instances`, `neo4j_get_schema`, `neo4j_read`, `neo4j_explain`, `neo4j_write`                                                                                                                                                                                                                                                         |
| `organization_agents`   | `vera_list_accessible_organization_agents`, `vera_send_message_to_organization_agent`                                                                                                                                                                                                                                                            |
| `shared_agents`         | Alias area for the same publication-directory discovery and messaging tools                                                                                                                                                                                                                                                                      |
| `profiles`              | `vera_list_profile_shares`, `vera_create_profile_share`, `vera_update_profile_share`, `vera_revoke_profile_share`                                                                                                                                                                                                                                |
| `remote`                | `vera_list_remote_environments`, `vera_get_remote_environment`, `vera_list_remote_machines`, `vera_run_remote_tool`                                                                                                                                                                                                                              |
| `mcp`                   | `vera_list_mcp_servers`, `vera_get_mcp_server`, `vera_refresh_mcp_server_tools`                                                                                                                                                                                                                                                                  |
| `skills`                | `vera_list_installed_skills`, `vera_list_trusted_skills`                                                                                                                                                                                                                                                                                         |
| `configured_connectors` | Namespaced tools such as `<connector>__<tool>` returned for the current user                                                                                                                                                                                                                                                                     |

If the server adds a tool after this catalog was published, discovery remains authoritative. Search the relevant area/query and inspect the returned schema.

## Live email workflow

Do not use channel history as a substitute for live mailbox access.

1. Discover `area: "email"` with schemas.
2. Use native `vera_list_channels` and choose an authorized channel whose provider is `email`.
3. Call `vera_list_email_accounts` when the account is unknown.
4. Call `vera_list_email_folders` and select the intended folder.
5. Use `vera_list_emails` for a bounded page or `vera_search_emails` for a live query.
6. Search uses Zoho syntax, for example `entire: inventory`, `content: requested parts`, `sender: user@example.com`, or `subject: invoice::has:attachment`; combine conditions with `::`.
7. Call `vera_get_email` using the exact returned `accountId`, `folderId`, and message ID. A bare message ID is not enough.
8. Call `vera_list_email_attachments` before `vera_get_email_attachment`. Small files may return base64; larger supported files return a short-lived artifact ID, integrity digest and download path. Follow the artifact workflow below; retrieving a server artifact does not mean it was saved locally.
9. Use `vera_generate_email_draft` for draft text. Review the exact mailbox, recipients, subject, body, and format before `vera_save_email_draft` with `confirm: true`.

Email rules:

- Email is draft-only. Do not send, schedule, queue, or transmit email.
- Reads and draft generation do not mark messages read.
- Zoho tokens remain encrypted server-side.
- Every call revalidates channel ownership/share/profile access.
- For broader safe Zoho GET coverage, list operations, describe one, then call it through `vera_call_zoho_mail_read`; Vera injects credentials and blocks non-read methods and unsafe paths.
- For indexed historical context rather than live mailbox truth, use `vera_search_knowledge` with email/Zoho sources.

## Save an attachment artifact locally (mod 0.5.8)

Preferred path when this mod is active:

1. Fetch the attachment using this same Vera connection. Keep its `artifactId`, `size` and `sha256` reference.
2. Call the registered **local** tool `vera_download_artifact` with `artifactId`, a new `filePath` inside the current session workspace, and `expectedSha256` when supplied. Approve the local file write. No URL, token or remote environment is an argument.
3. The trusted helper calls native `vera_read_artifact` internally through protected MCP authentication, decodes bounded chunks and verifies total size/SHA-256. It saves a private file without replacing an existing one; its response contains completion metadata, not base64 or credentials.
4. Only after `saved:true`, open/inspect the file before downstream business actions. Saving a PDF does not authorize a vendor bill or any other write.

The mod's active Vera server/user/organization must match the connection that created the artifact. A file fetched through a separate `verivolt_stage` connector is not automatically downloadable with a production Cowork login. Check `/vera-status`; change the active connection through its authorized owner/login workflow, or use the matching connector's MCP fallback. Never copy its Bearer token into a shell or chat.

**MCP-only Linux/server session:** discover native `vera_read_artifact` on the same connector that fetched the attachment, using the exact namespaced name returned by discovery. Read from `offset:0` with the default 4096-byte chunks, decode/append locally in order, continue at `nextOffset` until `eof:true`, and verify full size and SHA-256 before opening. MCP retains authentication; local decoding needs no network token and no Windows/remote machine. For automated bulk transfers prefer the mod helper to avoid passing bytes through model context. Never treat a truncated result, partial file, or unverified digest as a successful download.

Artifacts expire (default 15 minutes), disappear on restart, and remain process-local; multi-replica routing/storage is still a deployment limitation. Re-fetch expired/unavailable artifacts instead of blindly retrying. The local helper defaults to 25 MiB and 120 seconds, rejects path/symlink escapes and existing destinations, and removes its partial file on transfer failure. Unsupported publication filesystems or denied workspace access are separate errors, not a reason to bypass permissions.

## Channel workflow

There are two channel paths:

- Dedicated helpers: `vera_channels_list`, `vera_channel_history`, `vera_channel_send`, and `vera_channel_send_file` provide compact list/history and approval-gated non-email sending.
- Native MCP `area: "channels"`: use for status, creation, update, start/stop, deletion, sharing, and native send behavior.

Workflow:

1. List channels and resolve the exact ID from returned safe metadata.
2. For native lifecycle work, call `vera_get_channel_status` before a mutation.
3. Create, update, start, stop, share, or revoke only when the user requested it and the returned schema permits it.
4. Before sending, verify the exact channel, provider, recipient/chat/thread, and final content.
5. Call a send tool once. Sending is non-idempotent; do not retry blindly after timeout or an ambiguous response.
6. Email channels are blocked from channel-send tools and must use the draft-only email workflow.
7. Before deletion, re-read the exact channel and obtain explicit authorization; use required confirmation fields.

Native inbound routing is not implemented by polling history. It requires an authenticated event stream, claim/ack or cursor semantics, and exclusive route ownership so Vera Server and local Letta Code cannot both respond.

## Remote-environment workflow

1. Discover `area: "remote"` with schemas.
2. Call `vera_list_remote_environments` to list owned or approved shared environments.
3. Call `vera_get_remote_environment` for the selected environment.
4. Call `vera_list_remote_machines` before execution.
5. Select an exact online `environmentId`/machine and verify that its capabilities include the requested client tool.
6. Verify every file/workspace path is under the returned `allowedDirectories`.
7. Call `vera_run_remote_tool` only for the requested operation and with the required `confirm: true`.
8. Do not blindly retry a timed-out or ambiguous mutating call; inspect the machine or resulting state first because it may already have completed.

Remote access cannot bypass runner capabilities, workspace restrictions, command policy, profile sharing, or user approval. Vera cannot change a runner's desktop-local `autoApprove` setting or copy desktop-local credentials.

## Knowledge-graph workflow

Knowledge graphs are served by Vera's separately governed `/neo4j-mcp` endpoint but are discovered and invoked through the same mod tools. Neo4j credentials and connection URIs remain server-side.

1. Discover `area: "knowledge_graph"` with schemas.
2. Call `neo4j_list_instances` unless the user already supplied a verified instance slug in the current conversation.
3. Select the exact returned `slug`, not the display name. Check `effectivePermission` and `accessMode`.
4. Call `neo4j_get_schema` before writing Cypher that depends on unknown labels, relationships, properties, indexes, or constraints.
5. Use `neo4j_read` for retrieval. Keep the query bounded, include a sensible `LIMIT`, pass values through `parameters`, request only needed properties, and set `maxRecords`.
6. Use `neo4j_explain` before a non-trivial, potentially expensive, or complex query. It returns a plan without executing the query.
7. Use `neo4j_write` only when the user explicitly requested a mutation, the exact impact is understood, and both effective permission and instance access mode allow writes.

Graph rules:

- Do not interpolate user text into Cypher; use parameters.
- Prefer aggregate or existence queries before fetching large result sets.
- Never use a write merely to test connectivity.
- For complex writes, explain first and prefer an idempotent `MERGE` only when its uniqueness semantics are correct.
- Never run an unbounded delete, detach-delete, or mass update without explicit authorization.
- Do not bypass a denied graph query with a raw Neo4j driver, database URI, credentials, shell, or internal REST endpoint.
- If no instances are returned, report that no enabled instance is visible to the current Vera identity; do not guess a slug.
- The graph endpoint is optional and separately deployed. If no graph tools are discovered, base Vera and configured-connector discovery remain available.

## Vera response workflow

For `vera_respond`:

1. Resolve the intended agent if needed.
2. Call with the user's text and optional agent ID.
3. Save the returned `conversationId`.
4. Reuse that `conversationId` on follow-up calls.
5. Treat the call as open-world and non-idempotent because the selected agent may use tools.

## Shared-agent access and delegation

Vera agent sharing publishes selected Letta agents from one organization to all active members or selected members of the same or another organization. It is ordinary user-scoped delegation, not Master Clio access, agent duplication, credential transfer, or administrative control over the target agent.

Keep the direction clear:

- The **publishing organization** owns the Letta agent and the access grant.
- The **target organization/member** receives permission to discover and contact that publication.
- The opaque **publication ID** identifies the currently authorized publication and is revalidated before every send.
- Removing or editing a grant affects later discovery and sends, but does not erase already completed target conversations or memory effects.

Discovery and messaging workflow:

1. Use `vera_list_accessible_organization_agents`; `area: "shared_agents"` or `area: "organization_agents"` also discovers the native equivalents.
2. Select a scope when useful: `all`, `organization`, `member`, `trusted_organization`, or `trusted_member`.
3. Read the access summary and verify the publisher organization, `grantedThrough` value, target agent, and exact current `publicationId`.
4. Never construct a publication ID, use a name as authority, or assume a previously returned publication remains valid.
5. Call `vera_send_message_to_organization_agent` with the exact publication ID and the complete bounded task.
6. Wait for and return the target agent's final reply.

Each send starts a new isolated target-agent conversation. It is not a passive notification and does not continue a prior delegated conversation. The target runs through its publishing organization's Letta connection and may use its own configured tools, so publishing an agent is a real access decision.

Compatibility aliases `vera_list_organization_agents` and `vera_delegate_to_organization_agent` remain available, but new work should use the publication-directory tools.

Grant management is an administrative Vera web operation rather than an MCP/mod tool. An owner/admin of the publishing organization, or a Vera super administrator, configures it under **Organization settings → AI & messaging → Agent sharing**. Cross-organization sharing additionally requires the configuring administrator to have an active membership in the target organization. Normal users may discover and contact agents already shared with them but cannot create or expand grants.

Do not confuse agent-publication grants with profile sharing. A profile share whose scopes include `agents` controls access to profile-backed resources; it does not itself publish an organization agent for delegation. Likewise, publishing an agent does not change channel routing or make that agent a channel's default responder.

## Schedules, knowledge, profiles, MCP servers, and skills

- Schedules: list first, then inspect the exact schedule and run history. Create/update/toggle/delete only when requested. Deletion requires exact-target verification and confirmation.
- Knowledge: use `vera_search_knowledge` for authorized indexed content. Start narrow, apply source/time filters, and paginate rather than requesting an unbounded result.
- Profile sharing: list existing shares first. Share only requested scopes such as `channels`, `email`, `mcp`, `remoteMachines`, `conversations`, or `agents`. Revocation requires confirmation.
- MCP configurations: list and inspect safe metadata. Refresh discovery only when requested or stale. Credentials are never returned.
- Skills: installed/trusted skill operations are read-only inventory. This mod does not expose skill installation, update, removal, or admin publication through MCP.
- Configured connectors: discover the exact namespaced tool and schema. Vera keeps provider credentials server-side and applies the user's connector permissions.

## Direct mod tools

| Tool                                       | Use                                                                                   | Approval    |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ----------- |
| `vera_mcp_list_tools`                      | Guided discovery by area/query; can include schemas and returns workflow guidance     | Automatic   |
| `vera_mcp_call_tool`                       | Invoke one exact discovered Vera-native, governed Neo4j, or configured-connector tool | Always asks |
| `vera_channels_list`                       | Basic owned/shared channel metadata                                                   | Automatic   |
| `vera_channel_history`                     | Bounded channel delivery logs; not live mailbox bodies                                | Automatic   |
| `vera_channel_send`                        | Send one non-email text message                                                       | Always asks |
| `vera_channel_send_file`                   | Send one local file through a non-email channel                                       | Always asks |
| `vera_list_accessible_organization_agents` | List publication-directory agents and grant context                                   | Automatic   |
| `vera_send_message_to_organization_agent`  | Send a complete task to an exact publication                                          | Always asks |
| `vera_list_organization_agents`            | Compatibility directory alias                                                         | Automatic   |
| `vera_delegate_to_organization_agent`      | Compatibility send alias                                                              | Always asks |

## Master Clio tools

Master tools are dynamically hidden unless the runtime agent is the enrolled Master identity. They also require a current Vera `super_admin` principal and the appropriate organization grant.

Read tools:

- `vera_master_list_accessible_organizations`
- `vera_master_list_organization_agents`
- `vera_master_get_organization_agent`
- `vera_master_get_agent_instructions`
- `vera_master_list_agent_memory`
- `vera_master_get_agent_memory_block`
- `vera_master_git_read`

Approval-gated mutation/delegation tools:

- `vera_master_create_organization_agent` — optionally include `memoryBlocks` for initial setup.
- `vera_master_create_agent_memory_block`
- `vera_master_attach_agent_memory_block`
- `vera_master_update_organization_agent`
- `vera_master_delete_organization_agent`
- `vera_master_update_agent_instructions`
- `vera_master_update_agent_memory_block`
- `vera_master_git_write`
- `vera_master_delegate_to_organization_agent`

Master rules:

- Runtime identity comes only from `ctx.agent.id`; model-provided identity is ignored.
- List and read the exact organization/agent/content version before mutation.
- Preserve optimistic-concurrency hashes and protected instruction layers.
- Never infer that an organization grant authorizes every capability.
- Mutations require human approval; deletion is permanent.
- Memory tools default to `memoryStorage: "memfs"`. New agents use a Letta v1/git-memory request with the structural `MEMORY` root block. Initial content comes only from caller-supplied `memoryBlocks`; do not invent it or expand grants.
- The existing create-memory tool writes an actual Markdown file using the target organization's connection, commits/pushes, reads back, then requests recompilation. `agents.manage` covers this setup. Existing API records are not automatically migrated or deleted, and no duplicate API blocks are created by a MemFS write.
- Bare labels resolve to root Markdown files when `MEMORY.md` exists; otherwise they resolve under `system/`. Use list/read to inspect the actual layout. Safe nested labels are supported; subdirectory files are not necessarily pinned or projected in the latest root layout.
- File values default to a 5000-character limit. Creation refuses existing paths and symlinks. Updates preserve existing frontmatter and require `memory.write`, `expectedSha256` and `expectedContentSha256` from the latest read. Never overwrite managed governance implicitly.
- For sharing, supply `repositoryId` verified on a readable, allowlisted `sourceAgentId` in the same organization. The target requires `agents.manage`; new shared links are read-only. An agent-owned primary MemFS repository cannot be shared via this operation. Shared repositories are discoverable knowledge, not automatically the target's own pinned memory.
- Legacy API block operations are explicit `memoryStorage: "legacy-blocks"`; sharing then uses `blockId`. Shared legacy content edits still require write coverage for every referenced agent, with bounded reference verification.
- Read target `updated_at` before creation/attachment and supply `expectedUpdatedAt`. Interpret receipts separately: saved/API-attached, file-visible, prompt-recompiled and runtime-loaded. `runtimeLoaded: "not_checked"` is not completed memory setup. Verify a fresh target conversation separately before claiming usability. A failed recompile/read-back is not a reason to blindly create another agent, duplicate records, or delete memory.
- Only the target organization's explicit Letta credentials are used; global or personal fallback is refused.

## Safety and error handling

- Vera is the source of truth for identity, organization, ownership, connector access, channel access, sharing, capabilities, and policy.
- Provider credentials and token plaintext must never appear in tool arguments, results, output, screenshots, logs, memory, or chat.
- Cowork-managed tokens must not be copied into mod state or revoked by `/vera-disconnect`.
- Every generic MCP invocation is approval-gated because the selected Vera, Neo4j, or connector tool may mutate state.
- Confirm exact IDs and current state before any mutation or deletion.
- `401` or tools unavailable: ask the user to refresh/reconnect Vera; never request token plaintext.
- Not found: refresh the relevant list and verify the exact ID.
- Forbidden: report the ownership/organization/role/capability boundary; do not bypass it.
- Confirmation required: re-check the exact target and obtain explicit user authorization.
- Truncated result: narrow the query or paginate.
- Timeout/ambiguous result on a non-idempotent tool: inspect resulting state before deciding whether another call is safe.
