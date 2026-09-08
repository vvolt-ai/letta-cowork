# Vera for Letta Code

Native Letta Code package for user-scoped Vera authentication, MCP tool access, and messaging-channel access. It is a Letta Code mod, not a separate runtime or fork.

## Current vertical slice

- Browser OAuth authorization-code login with PKCE and a loopback callback
- Optional email OTP fallback using Vera's existing `/auth/otp/*` endpoints
- Automatic reuse of a signed-in Vera Cowork session from `~/.letta-cowork/cowork.env`
- OAuth/OTP refresh-token rotation, revocation, and logout
- Full Vera MCP tool discovery and invocation through the dynamic bridge
- Browser-approved Master Clio enrollment with a narrow scope and Ed25519 request assertions
- Accessible channel listing and message history
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

## Agent tools

| Tool | Behavior | Approval |
|---|---|---|
| `vera_mcp_list_tools` | Discover available Vera MCP tools and schemas | Automatic |
| `vera_mcp_call_tool` | Invoke any exact namespaced MCP tool advertised to the authenticated Vera user | Always asks |
| `vera_master_list_accessible_organizations` | List organization grants for the exact enrolled runtime agent | Automatic |
| `vera_master_list_organization_agents` | List grant-filtered agents in one accessible organization | Automatic |
| `vera_channels_list` | List owned/shared channels visible to the user | Automatic |
| `vera_channel_history` | Read channel message logs | Automatic |
| `vera_channel_send` | Send a non-email text message | Always asks |
| `vera_channel_send_file` | Upload and send a local file through a non-email channel | Always asks |

The generic MCP bridge avoids placing every connector schema in every model request. The agent first discovers the exact tool and then invokes it. Frequently used tools can be materialized as direct Letta tools in a later release.

The generic MCP bridge does not silently remove server-advertised capabilities, including email tools. Every generic invocation uses Letta Code's `ask` approval policy. The separate `vera_channel_send` and file-send helpers continue to reject email channels so they cannot bypass the generic MCP approval boundary.

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

GET  /mcp/tools
POST /mcp/tools/invoke

GET  /channels/accessible
POST /master-agent-auth/installations/enroll
GET  /master-agent-access/status
POST /master-agent-auth/challenges
POST /master-agent-auth/tokens/exchange
GET  /master-agent-access/organizations
GET  /master-agent-access/organizations/:organizationId/agents

GET  /channels/:channelId/messages
POST /channels/:channelId/send
POST /channels/:channelId/send-file-upload
```

Normal MCP and channel endpoints use the browser/Cowork user's bearer token. Master Clio endpoints use browser approval only for enrollment, then signed installation identity and operation-bound short-lived tokens. Vera remains the authorization boundary in both cases.

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
