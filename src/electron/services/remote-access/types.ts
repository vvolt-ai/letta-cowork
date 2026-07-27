export interface RemoteAccessSettings {
  enabled: boolean;
  environmentName: string;
  allowedDirectories: string[];
  autoApprove: boolean;
}

export type RemoteAccessStatus = "disabled" | "connecting" | "online" | "offline" | "error";

export interface RemoteAccessState {
  settings: RemoteAccessSettings;
  status: RemoteAccessStatus;
  environmentId?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
  serverUrl?: string;
}

export interface RunnerRegisterMessage {
  type: "runner.register";
  environmentName: string;
  machineId: string;
  capabilities: string[];
  allowedDirectories: string[];
  cwd?: string;
  os?: string;
  version?: string;
  autoApprove: boolean;
}

export interface RunnerHeartbeatMessage {
  type: "runner.heartbeat";
  environmentId: string;
  timestamp: string;
}

export interface RunnerToolResultMessage {
  type: "tool.result";
  requestId: string;
  status: "success" | "error" | "cancelled";
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ServerToolRequestMessage {
  type: "tool.request";
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
  cwd?: string;
  timeoutMs?: number;
  conversationId?: string;
  agentId?: string;
}

export interface ServerToolCancelMessage {
  type: "tool.cancel";
  requestId: string;
}

export type ServerRemoteRunnerMessage =
  | { type: "runner.connected" }
  | { type: "runner.registered"; environment: { id: string; name?: string; status?: string } }
  | { type: "runner.registration_required" }
  | { type: "runner.heartbeat.ack"; environmentId: string }
  | { type: "error"; message: string }
  | ServerToolRequestMessage
  | ServerToolCancelMessage;
