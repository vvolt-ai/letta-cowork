# Vera for Letta Code

Native Letta Code package for user-scoped Vera authentication, MCP tool access, and messaging-channel access. It is a Letta Code mod, not a separate runtime or fork.

## Current vertical slice

- Email OTP login using Vera's existing `/auth/otp/*` endpoints
- Automatic reuse of a signed-in Vera Cowork session from `~/.letta-cowork/cowork.env`
- Refresh-token rotation and logout
- Vera MCP tool discovery and invocation
- Accessible channel listing and message history
- Approval-gated non-email text and file sending
- Hard blocking for email sending, scheduling, queueing, or transmission; agents may draft only
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

The default development server is `http://localhost:3010`.

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

### Standalone login fallback

```text
/vera-connect user@verivolt.com
```

After receiving the six-digit code:

```text
/vera-connect 123456
```

Use a deployed Vera server:

```text
/vera-connect --server https://vera-cowork-server.ngrok.app user@verivolt.com
```

Other commands:

```text
/vera-status
/vera-sync
/vera-tools [filter]
/vera-disconnect
```

`/vera-connect` is excluded from the conversation transcript so the OTP is not sent to the model. Depending on the terminal, the raw command can still be retained in local shell or UI history. A browser/device authorization flow should replace terminal OTP entry in a later release.

### OTP troubleshooting

Vera's OTP request endpoint is enumeration-safe: an accepted response does not prove that the email belongs to an active Vera user or that mail was delivered. If no code arrives, verify that the user is active, has an active organization membership, and that the deployed server has working `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` settings. When `SMTP_HOST` is absent, the current Vera development fallback logs the OTP server-side instead of sending mail.

## Agent tools

| Tool | Behavior | Approval |
|---|---|---|
| `vera_mcp_list_tools` | Discover available Vera MCP tools and schemas | Automatic |
| `vera_mcp_call_tool` | Invoke an exact namespaced Vera MCP tool; outbound email actions are blocked | Normal tool approval |
| `vera_channels_list` | List owned/shared channels visible to the user | Automatic |
| `vera_channel_history` | Read channel message logs | Automatic |
| `vera_channel_send` | Send a non-email text message | Always asks |
| `vera_channel_send_file` | Upload and send a local file through a non-email channel | Always asks |

The generic MCP bridge avoids placing every connector schema in every model request. The agent first discovers the exact tool and then invokes it. Frequently used tools can be materialized as direct Letta tools in a later release.

Outbound email is blocked in both the generic MCP path and Vera email-channel path. Draft creation and read operations remain available; a human must manually review and send every email.

## Authentication and local state

For standalone OTP login, connection state is stored at:

```text
~/.letta/vera/connection.json
```

The directory is set to mode `0700` and the file to mode `0600`. Override locations for tests or managed environments with:

```bash
VERA_LETTA_STATE_PATH=/secure/path/connection.json
```

Standalone access and refresh tokens are used only inside the trusted local mod. Tool arguments, tool results, and agent context do not contain them. `/vera-disconnect` revokes the standalone refresh token on Vera and removes the local tokens. When Cowork authentication is active, Cowork remains the credential owner and logout must happen in Cowork.

A platform credential-store adapter is a recommended hardening follow-up for shared machines.

## Vera API contracts used

```text
POST /auth/otp/request
POST /auth/otp/verify
POST /auth/refresh
POST /auth/logout
GET  /auth/me

GET  /mcp/tools
POST /mcp/tools/invoke

GET  /channels/accessible
GET  /channels/:channelId/messages
POST /channels/:channelId/send
POST /channels/:channelId/send-file-upload
```

All capability endpoints use the logged-in user's bearer token, so Vera remains the authorization boundary for organization, connector, and channel access.

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
