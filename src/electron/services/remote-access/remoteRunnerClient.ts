import os from "node:os";

import { WebSocket } from "ws";

import { RemoteToolDispatcher } from "./remoteToolDispatcher.js";
import { getVeraCoworkApiClient } from "../../api/index.js";
import { getClientToolsForWire } from "../client-tools/index.js";

import type {
  RemoteAccessSettings,
  RemoteAccessState,
  ServerRemoteRunnerMessage,
  ServerToolRequestMessage,
} from "./types.js";

const HEARTBEAT_MS = 25_000;
const REGISTRATION_TIMEOUT_MS = 15_000;
const HEARTBEAT_ACK_TIMEOUT_MS = 20_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type StateListener = (state: RemoteAccessState) => void;

export class RemoteRunnerClient {
  private socket: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private heartbeatAckTimeout: NodeJS.Timeout | null = null;
  private registrationTimeout: NodeJS.Timeout | null = null;
  private reconnect: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private environmentId: string | undefined;
  private status: RemoteAccessState["status"] = "disabled";
  private lastHeartbeatAt: string | undefined;
  private lastError: string | undefined;

  constructor(
    private settings: RemoteAccessSettings,
    private readonly onState?: StateListener,
  ) {}

  updateSettings(settings: RemoteAccessSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = settings;
    if (!settings.enabled) {
      this.stop();
      return;
    }
    if (!wasEnabled || !this.socket || this.socket.readyState === WebSocket.CLOSED) {
      this.start();
    }
  }

  restart(): void {
    if (!this.settings.enabled) {
      this.stop();
      return;
    }

    this.clearReconnect();
    this.clearConnectionTimers();
    this.environmentId = undefined;
    this.lastError = undefined;

    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.terminate();
    }

    this.start();
  }

  start(): void {
    if (!this.settings.enabled) {
      this.setStatus("disabled");
      return;
    }
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return;

    const api = getVeraCoworkApiClient();
    const token = api.accessToken || process.env.COWORK_TOKEN;
    if (!token) {
      this.lastError = "Not authenticated with vera-cowork-server.";
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }

    const url = buildWebSocketUrl(api.apiBaseUrl, token);
    this.setStatus("connecting");
    const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${token}` } });
    this.socket = socket;

    socket.on("open", () => {
      if (this.socket !== socket) return;
      this.lastError = undefined;
      this.reconnectDelay = RECONNECT_MIN_MS;
      this.register();
      this.startRegistrationTimeout();
    });
    socket.on("message", (raw) => {
      if (this.socket === socket) this.handleMessage(raw.toString());
    });
    socket.on("close", () => {
      if (this.socket !== socket) return;
      this.clearConnectionTimers();
      this.socket = null;
      this.environmentId = undefined;
      this.setStatus(this.settings.enabled ? "offline" : "disabled");
      if (this.settings.enabled) this.scheduleReconnect();
    });
    socket.on("unexpected-response", (_request, response) => {
      if (this.socket !== socket) return;
      response.resume();
      this.forceReconnect(`Remote server rejected the runner connection (${response.statusCode}).`);
    });
    socket.on("error", (err) => {
      if (this.socket !== socket) return;
      this.forceReconnect(err.message);
    });
  }

  stop(): void {
    this.clearReconnect();
    this.clearConnectionTimers();
    this.environmentId = undefined;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, "remote access disabled");
    this.setStatus("disabled");
  }

  getState(): RemoteAccessState {
    return {
      settings: this.settings,
      status: this.status,
      environmentId: this.environmentId,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastError: this.lastError,
      serverUrl: getVeraCoworkApiClient().apiBaseUrl,
    };
  }

  private register(): void {
    const cwd = this.settings.allowedDirectories[0] || process.cwd();
    this.send({
      type: "runner.register",
      environmentName: this.settings.environmentName || os.hostname() || "cowork-desktop",
      machineId: getMachineId(),
      capabilities: getClientToolsForWire().map((tool) => tool.name),
      allowedDirectories: this.settings.allowedDirectories,
      cwd,
      os: `${process.platform}-${process.arch}`,
      version: process.env.npm_package_version,
      autoApprove: this.settings.autoApprove,
    });
  }

  private handleMessage(raw: string): void {
    let message: ServerRemoteRunnerMessage;
    try {
      message = JSON.parse(raw) as ServerRemoteRunnerMessage;
    } catch {
      return;
    }

    if (message.type === "runner.registered") {
      this.clearRegistrationTimeout();
      this.clearHeartbeatAckTimeout();
      this.environmentId = message.environment.id;
      this.setStatus("online");
      this.startHeartbeat();
      return;
    }
    if (message.type === "runner.registration_required") {
      this.clearConnectionTimers();
      this.environmentId = undefined;
      this.setStatus("connecting");
      this.register();
      this.startRegistrationTimeout();
      return;
    }
    if (message.type === "runner.heartbeat.ack") {
      if (message.environmentId !== this.environmentId) return;
      this.clearHeartbeatAckTimeout();
      this.lastHeartbeatAt = new Date().toISOString();
      this.emitState();
      return;
    }
    if (message.type === "tool.request") {
      void this.handleToolRequest(message);
      return;
    }
    if (message.type === "error") {
      this.lastError = message.message;
      this.emitState();
    }
  }

  private async handleToolRequest(message: ServerToolRequestMessage): Promise<void> {
    const dispatcher = new RemoteToolDispatcher(this.settings);
    const result = await dispatcher.runTool({
      requestId: message.requestId,
      toolName: message.toolName,
      args: message.args ?? {},
      cwd: message.cwd,
      timeoutMs: message.timeoutMs,
      agentId: message.agentId,
      conversationId: message.conversationId,
    });
    this.send({
      type: "tool.result",
      requestId: message.requestId,
      status: result.status,
      output: result.output,
      metadata: result.metadata,
    });
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.sendHeartbeat();
    this.heartbeat = setInterval(() => this.sendHeartbeat(), HEARTBEAT_MS);
  }

  private sendHeartbeat(): void {
    if (!this.environmentId) return;
    this.send({
      type: "runner.heartbeat",
      environmentId: this.environmentId,
      timestamp: new Date().toISOString(),
    });
    if (!this.heartbeatAckTimeout) {
      this.heartbeatAckTimeout = setTimeout(() => {
        this.heartbeatAckTimeout = null;
        this.forceReconnect("Remote server stopped acknowledging heartbeats.");
      }, HEARTBEAT_ACK_TIMEOUT_MS);
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnect = setTimeout(() => {
      this.reconnect = null;
      this.start();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private startRegistrationTimeout(): void {
    this.clearRegistrationTimeout();
    this.registrationTimeout = setTimeout(() => {
      this.registrationTimeout = null;
      this.forceReconnect("Remote server did not register this machine.");
    }, REGISTRATION_TIMEOUT_MS);
  }

  private forceReconnect(reason: string): void {
    if (!this.settings.enabled) return;
    this.lastError = reason;
    this.setStatus("offline");
    const socket = this.socket;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.terminate();
      return;
    }
    this.socket = null;
    this.scheduleReconnect();
  }

  private clearHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private clearHeartbeatAckTimeout(): void {
    if (this.heartbeatAckTimeout) clearTimeout(this.heartbeatAckTimeout);
    this.heartbeatAckTimeout = null;
  }

  private clearRegistrationTimeout(): void {
    if (this.registrationTimeout) clearTimeout(this.registrationTimeout);
    this.registrationTimeout = null;
  }

  private clearConnectionTimers(): void {
    this.clearHeartbeat();
    this.clearHeartbeatAckTimeout();
    this.clearRegistrationTimeout();
  }

  private clearReconnect(): void {
    if (this.reconnect) clearTimeout(this.reconnect);
    this.reconnect = null;
  }

  private send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }

  private setStatus(status: RemoteAccessState["status"]): void {
    this.status = status;
    this.emitState();
  }

  private emitState(): void {
    this.onState?.(this.getState());
  }
}

function buildWebSocketUrl(apiBaseUrl: string, token: string): string {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/remote-runner";
  url.searchParams.set("token", token);
  return url.toString();
}

function getMachineId(): string {
  return `${os.hostname()}-${process.platform}-${process.arch}`;
}
