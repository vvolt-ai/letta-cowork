# Vera mod

## Purpose

Connect a local Letta Code agent to user-authorized Vera MCP connectors and messaging channels without copying upstream connector credentials into Letta Code.

When Vera Cowork is signed in, the mod reuses the current access token from
`~/.letta-cowork/cowork.env` and re-reads it for each request. Cowork remains
the owner of that session. Browser OAuth authorization-code flow with PKCE is the primary standalone path; terminal email OTP remains a fallback.

## Commands

- `/vera-connect [--server <url>] [browser|email|otp]`
- `/vera-status`
- `/vera-sync`
- `/vera-tools [filter]`
- `/vera-disconnect`
- `/vera-master-enroll [device name]`
- `/vera-master-status`

## Tools

- `vera_mcp_list_tools`
- `vera_mcp_call_tool`
- `vera_list_organization_agents`
- `vera_delegate_to_organization_agent`
- `vera_master_list_accessible_organizations`
- `vera_master_list_organization_agents`
- `vera_master_get_organization_agent`
- `vera_master_create_organization_agent`
- `vera_master_update_organization_agent`
- `vera_master_delete_organization_agent`
- `vera_master_get_agent_instructions`
- `vera_master_update_agent_instructions`
- `vera_master_list_agent_memory`
- `vera_master_get_agent_memory_block`
- `vera_master_update_agent_memory_block`
- `vera_master_git_read`
- `vera_master_git_write`
- `vera_master_delegate_to_organization_agent`
- `vera_channels_list`
- `vera_channel_history`
- `vera_channel_send`
- `vera_channel_send_file`

## Safety boundaries

- Vera remains the source of truth for user, organization, connector, and channel authorization.
- The dynamic `vera_mcp_list_tools` + `vera_mcp_call_tool` bridge exposes every tool currently authorized by Vera without injecting every remote schema into each model request.
- Standalone login uses dynamic public-client registration, PKCE, state validation, and a loopback-only callback.
- Provider credentials remain on Vera Server.
- Non-email channel sends and file sends always require human approval.
- Every MCP tool advertised by Vera is callable through the generic bridge; every invocation requires Letta Code approval because the selected remote tool can be mutating.
- Dedicated channel-send helpers still reject email channels so they cannot bypass the generic MCP approval boundary.
- Tokens must never appear in command output or tool results.
- Cowork-managed tokens must not be copied into mod state or revoked by `/vera-disconnect`.
- Normal same-organization listing and delegation use the connected Vera member's published-agent access and do not require Master Clio.
- Master tools are dynamically hidden from non-enrolled runtime agents. Master calls derive identity only from runtime `ctx.agent.id`; model-provided identity arguments are ignored.
- Master enrollment uses a one-time browser grant restricted to `vera:master-enroll`; operational requests use one-time challenges, Ed25519 signatures, and short-lived scoped tokens.
- Copying the mod or identity file to another agent does not authorize it because Vera verifies the enrolled runtime agent ID.
- Master agent, instruction, memory, Git, and delegation operations are independently capability-checked against the organization grant. Mutations require human approval; stale agent or content versions are rejected rather than overwritten.
- Native inbound delivery must not be enabled until Vera has exclusive route ownership and an acknowledged event stream.
