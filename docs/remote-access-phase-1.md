# Remote Access Phase 1 Plan

## Goal

Add a Letta Code-style remote environment option to Cowork so an agent can execute tools on an enabled remote machine, including when the user is chatting through WhatsApp.

Phase 1 intentionally uses **auto approval** for remote tool execution so the WhatsApp path works without an interactive desktop approval loop. We will still keep server-side guardrails and an allowlist so auto approval does not mean unrestricted machine access.

## Target user experience

### Enable remote access from Cowork desktop

User opens Cowork on a machine and enables it as a remote environment:

1. Open **Settings → Remote Access**.
2. Toggle **Enable this machine as remote environment**.
3. Enter/display environment name, for example `office-mac`.
4. Select allowed workspace directories.
5. Cowork connects outbound to `vera-cowork-server` over WebSocket.
6. Server marks environment online.

Example UI state:

```txt
Remote Access: Enabled
Environment: office-mac
Status: Online
Allowed workspaces:
- ~/Desktop/vv/new
Tools: ProjectContext, Git, Read, LS, Grep, Bash, LogTail
Approval mode: Auto approve for Phase 1
```

### Access remote environment from WhatsApp

User sends a WhatsApp message to an agent/channel:

```txt
Use office-mac and check why the build is failing in letta-cowork.
```

Runtime flow:

1. WhatsApp message enters `vera-cowork-server` channel runtime.
2. Agent selects or is assigned a remote environment.
3. Tool calls are routed by server to the online Cowork desktop runner.
4. Cowork desktop executes local tools on that machine.
5. Results stream back to server.
6. Agent replies to WhatsApp with findings/fixes.

No desktop user interaction is required in Phase 1 because remote calls are auto approved.

## Architecture

```txt
WhatsApp
  ↓
vera-cowork-server channel runtime
  ↓
RemoteToolExecutor
  ↓ WebSocket
Cowork Desktop Remote Runner
  ↓
Local tools on enabled machine
(Bash, Read, Git, ProjectContext, LogTail, etc.)
```

## Phase 1 scope

### In scope

- Enable/disable remote access from Cowork desktop.
- Register current desktop as a remote environment.
- Outbound WebSocket from desktop to server.
- Heartbeat and online/offline status.
- Server-side environment registry.
- Remote tool request/response protocol.
- Auto approval mode for Phase 1.
- Route WhatsApp-originated agent tool calls to selected remote env.
- Minimal remote tool set:
  - `ProjectContext`
  - `Git` read operations: `status`, `diff`, `log`, `branch`
  - `Read`
  - `LS`
  - `Grep` / `Glob` if available
  - `Bash`
  - `LogTail`
- Tool output returned to agent and channel.
- Send generated/downloaded files from the selected remote environment back to the user over WhatsApp.

### Out of scope for Phase 1

- Manual approval UI for every remote action.
- Multi-user permission policies.
- Secret sync.
- Background shell sessions and reconnectable output streams.
- Remote file browser UI.
- Full scheduler integration for reminders.
- Running remote env without Cowork desktop installed.
- Cloud-hosted runner image.

## Security posture for Phase 1

Even with auto approval, keep these guardrails:

1. Remote runner connects outbound only; no inbound port required.
2. Runner authenticates with user/session token from Cowork login.
3. Runner has an environment ID and machine ID.
4. Server only routes calls for environments owned by the same user/org.
5. Filesystem tools are limited to configured allowed directories.
6. Shell runs with an explicit cwd under an allowed directory.
7. Block obviously destructive commands by default:
   - `rm -rf /`
   - `sudo rm`
   - `mkfs`
   - `diskutil erase`
   - `git push --force`
   - fork bombs
8. Redact known secret patterns in output.
9. Audit-log every remote tool call.

## Backend plan: `vera-cowork-server`

### Module

Add:

```txt
src/remote-environments/
  remote-environments.module.ts
  remote-environments.service.ts
  remote-environments.controller.ts
  remote-runner.gateway.ts
  remote-tool-executor.ts
  dto/
    register-remote-environment.dto.ts
    remote-tool-request.dto.ts
```

### Data model

Start in-memory or simple persistence depending on current server patterns; prefer DB if auth/org tables are already ready.

```ts
export interface RemoteEnvironment {
  id: string;
  userId: string;
  organizationId?: string;
  name: string;
  machineId: string;
  status: 'online' | 'offline';
  lastSeenAt: string;
  capabilities: string[];
  allowedDirectories: string[];
  cwd?: string;
  os?: string;
  version?: string;
  autoApprove: boolean;
}
```

### REST endpoints

```txt
GET    /remote-environments
GET    /remote-environments/:id
PATCH  /remote-environments/:id
DELETE /remote-environments/:id
```

### WebSocket gateway

Endpoint:

```txt
/ws/remote-runner
```

Runner → server messages:

```ts
type RunnerRegister = {
  type: 'runner.register';
  environmentName: string;
  machineId: string;
  capabilities: string[];
  allowedDirectories: string[];
  cwd?: string;
  os?: string;
  version?: string;
  autoApprove: true;
};

type RunnerHeartbeat = {
  type: 'runner.heartbeat';
  environmentId: string;
  timestamp: string;
};

type RunnerToolResult = {
  type: 'tool.result';
  requestId: string;
  status: 'success' | 'error' | 'cancelled';
  output: string;
  metadata?: Record<string, unknown>;
};
```

Server → runner messages:

```ts
type ServerToolRequest = {
  type: 'tool.request';
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  cwd?: string;
  timeoutMs?: number;
  conversationId?: string;
  agentId?: string;
};

type ServerToolCancel = {
  type: 'tool.cancel';
  requestId: string;
};
```

### Remote tool executor

Add abstraction in runtime:

```ts
interface ToolExecutor {
  runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
```

Implement:

```ts
RemoteToolExecutor
```

Responsibilities:

- Find online environment.
- Check ownership/org.
- Check capability.
- Send `tool.request` over WebSocket.
- Await `tool.result` with timeout.
- Return result to agent runtime.

## Desktop plan: `letta-cowork`

### Remote access service

Add:

```txt
src/electron/services/remote-access/
  remoteAccessService.ts
  remoteRunnerClient.ts
  remoteToolDispatcher.ts
  remoteAccessSettings.ts
```

Responsibilities:

- Store enable/disable setting.
- Store environment name.
- Store allowed directories.
- Connect WebSocket to server when enabled.
- Register environment.
- Send heartbeat.
- Execute incoming tool requests using existing client-tools registry.
- Return results.

### Reuse existing tool registry

Remote dispatcher should call existing local client tool framework:

```ts
runClientTool(toolName, args, {
  signal,
  agentId,
  conversationId,
});
```

### Settings UI

Add UI section:

```txt
Settings → Remote Access
```

Fields:

- Toggle: Enable remote access
- Environment name
- Status indicator
- Allowed directories
- Auto approval notice
- Connected server URL
- Last heartbeat

Phase 1 copy:

```txt
Auto approval is enabled for Phase 1. Agents from approved channels, including WhatsApp, can run tools on this machine inside the allowed directories.
```

## WhatsApp file sending plan

Inbound WhatsApp media is already handled in `vera-cowork-server` by downloading WhatsApp media and uploading it as agent attachments. Phase 1 should add the reverse path: agent/remote environment produces a file, server sends it to WhatsApp.

### User experience

```txt
User: use office-mac, run the report and send me the PDF here
Agent:
  - runs command on office-mac
  - finds generated PDF inside allowed workspace
  - uploads/streams file to server
  - sends the PDF to the same WhatsApp chat
  - replies: Sent report.pdf
```

### Tool/API shape

Add a channel-safe tool exposed to the agent:

```ts
send_file_to_channel({
  channelId: string;
  to: string;
  filePath?: string;      // remote/local path, validated by runner allowlist
  fileUrl?: string;       // optional server-managed URL
  fileName?: string;
  mimeType?: string;
  caption?: string;
})
```

For remote environments, file sending should be two-step:

1. `RemoteToolExecutor` asks the runner to read/upload the file from the remote machine.
2. `vera-cowork-server` sends the resulting media/document over WhatsApp.

This avoids giving the server direct filesystem access to the remote machine.

### WhatsApp bridge change

Extend the bridge interface beyond text-only `sendMessage`:

```ts
interface OutboundFilePayload {
  to: string;
  fileName: string;
  mimeType: string;
  buffer?: Buffer;
  url?: string;
  caption?: string;
}

sendFile?(channelId: string, payload: OutboundFilePayload): Promise<string>;
```

Implement in `WhatsAppBridge` using Baileys:

```ts
socket.sendMessage(target, {
  document: buffer,
  fileName,
  mimetype: mimeType,
  caption,
});
```

For images, optionally use:

```ts
socket.sendMessage(target, {
  image: buffer,
  caption,
});
```

Selection rule:

- `image/*` → send as image.
- `video/*` → send as video if below size limit.
- `audio/*` → send as audio/document depending format.
- everything else → send as document.

### Limits and validation

- Enforce max file size in config, default 16 MB for Phase 1.
- Validate file path is inside allowed remote workspace.
- Block hidden credential files by default: `.env`, private keys, auth sessions.
- Require explicit user intent in the conversation before sending a file.
- Record audit event: who requested, source env, file name, size, destination WhatsApp chat.

## WhatsApp routing plan

Wherever WhatsApp channel messages are converted into agent runs, add environment resolution:

Priority:

1. Explicit user instruction: `use office-mac`, `on mac mini`, etc.
2. Conversation/channel saved environment preference.
3. Agent default environment.
4. If exactly one online environment exists, use it.
5. Otherwise ask the user on WhatsApp to choose.

Example WhatsApp response when ambiguous:

```txt
I found 2 remote environments online:
1. office-mac
2. cloud-vm
Reply with: use office-mac
```

## Todo checklist

### Backend

- [ ] Create `remote-environments` module.
- [ ] Add remote environment model/interface.
- [ ] Add in-memory registry first; upgrade to DB after protocol works.
- [ ] Add REST list/detail/update/delete endpoints.
- [ ] Add WebSocket gateway at `/ws/remote-runner`.
- [ ] Implement runner registration.
- [ ] Implement heartbeat and offline timeout.
- [ ] Implement pending remote tool request map.
- [ ] Implement `RemoteToolExecutor`.
- [ ] Add audit log for every remote tool call.
- [ ] Add capability validation.
- [ ] Add workspace path validation.
- [ ] Add destructive shell command blocklist.
- [ ] Integrate remote executor into Letta runtime client-tool path.
- [ ] Add environment resolution for WhatsApp-originated messages.

### Desktop

- [ ] Add remote access settings storage.
- [ ] Add remote runner WebSocket client.
- [ ] Register environment with server.
- [ ] Send heartbeat every 15-30 seconds.
- [ ] Reconnect with backoff.
- [ ] Add remote tool dispatcher using existing `runClientTool`.
- [ ] Add cancellation handling via `AbortController`.
- [ ] Add allowlisted directory validation before executing file/shell tools.
- [ ] Add output redaction for common secret patterns.
- [ ] Add Settings UI: Remote Access section.
- [ ] Add enable/disable toggle.
- [ ] Add environment name field.
- [ ] Add allowed directories picker.
- [ ] Add status indicator.

### WhatsApp / channels

- [ ] Store selected remote environment per channel/conversation.
- [ ] Parse explicit environment selection from user message.
- [ ] Ask user to choose if multiple remote environments are online.
- [ ] Route selected conversation's tool calls to remote executor.
- [ ] Return remote tool errors clearly in WhatsApp.
- [ ] Extend `ChannelBridge` with optional `sendFile`/media method.
- [ ] Implement outbound file sending in `WhatsAppBridge` using Baileys document/image/video/audio payloads.
- [ ] Add channel tool/API for `send_file_to_channel`.
- [ ] Add remote file upload/read flow so files generated on remote env can be sent over WhatsApp.
- [ ] Add file size, mime type, workspace allowlist, and sensitive-file checks.
- [ ] Add audit log for outbound WhatsApp file sends.

### Validation

- [ ] Enable desktop as `office-mac`.
- [ ] Confirm server shows environment online.
- [ ] From desktop chat, run `ProjectContext` remotely.
- [ ] From WhatsApp, ask agent to run `git status` remotely.
- [ ] From WhatsApp, ask agent to run safe `npm run build` remotely.
- [ ] Verify blocked destructive command fails.
- [ ] Verify environment goes offline after desktop disconnects.

## Open implementation decisions

1. Should the registry be in-memory for first PR or persisted immediately?
2. Do we already have a WebSocket gateway pattern in `vera-cowork-server` to copy?
3. Should remote access be per-user or per-organization in Phase 1?
4. Which WhatsApp channel table should store `selectedRemoteEnvironmentId`?
5. Should auto approval be global Phase 1 behavior or a per-environment toggle defaulted to on?

## Proposed first implementation PR

Ship one vertical slice:

1. Desktop setting enables remote runner.
2. Server sees environment online.
3. WhatsApp/channel runtime can route `ProjectContext` and `Git status` to it.
4. Agent can reply with remote results.

After that, expand tool coverage and UI polish.
