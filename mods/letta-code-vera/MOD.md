# Vera mod

## Purpose

Connect a local Letta Code agent to user-authorized Vera MCP connectors and messaging channels without copying upstream connector credentials into Letta Code.

When Vera Cowork is signed in, the mod reuses the current access token from
`~/.letta-cowork/cowork.env` and re-reads it for each request. Cowork remains
the owner of that session. Email OTP is the standalone fallback.

## Commands

- `/vera-connect [--server <url>] [email|otp]`
- `/vera-status`
- `/vera-sync`
- `/vera-tools [filter]`
- `/vera-disconnect`

## Tools

- `vera_mcp_list_tools`
- `vera_mcp_call_tool`
- `vera_channels_list`
- `vera_channel_history`
- `vera_channel_send`
- `vera_channel_send_file`

## Safety boundaries

- Vera remains the source of truth for user, organization, connector, and channel authorization.
- Provider credentials remain on Vera Server.
- Non-email channel sends and file sends always require human approval.
- Email sending, scheduling, queueing, and transmission are blocked; agents may draft email only.
- Generic MCP invocation uses normal Letta tool approval because the selected remote tool can be mutating.
- Tokens must never appear in command output or tool results.
- Cowork-managed tokens must not be copied into mod state or revoked by `/vera-disconnect`.
- Native inbound delivery must not be enabled until Vera has exclusive route ownership and an acknowledged event stream.
