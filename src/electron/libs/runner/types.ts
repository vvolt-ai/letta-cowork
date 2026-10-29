/**
 * Type definitions for the runner module.
 */

import type { ServerEvent } from "../../types.js";
import type { PendingPermission, SessionPermissionGrants } from "../runtime-state.js";
import type {
  MessageContentItem,
  SDKInitMessage,
  SDKMessage,
  SendMessage,
} from "@letta-ai/letta-agent-sdk";

/**
 * Simplified session type for runner.
 */
export type RunnerSession = {
  id: string;
  title: string;
  status: string;
  cwd?: string;
  pendingPermissions: Map<string, PendingPermission>;
  permissionGrants?: SessionPermissionGrants;
};

/** Desktop lifecycle adapter around native SDK execution. */
export type RunnerLettaSession = {
  initialize(): Promise<SDKInitMessage>;
  send(message: SendMessage): Promise<void>;
  stream(): AsyncGenerator<SDKMessage>;
  abort(): Promise<void>;
  readonly agentId: string | null;
  readonly conversationId: string | null;
  readonly accountScopeKey?: string;
  readonly cancellationRequested?: boolean;
  getDisplayName?():Promise<string|undefined>;
  readonly planMode?: import('./plan-mode/mode-manager.js').PlanModeManager;
  close?(): void;
};

/**
 * Options for running a Letta session.
 */
export type RunnerOptions = {
  prompt: string;
  timing?:import('./sdk/startup-timing.js').StartupTiming;
  content?: MessageContentItem[];
  session: RunnerSession;
  resumeConversationId?: string;
  preferredAgentId?: string;
  lettaConnectionId?: string;
  model?: string;
  permissionMode?: "standard" | "acceptEdits" | "unrestricted" | "strict";
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: { lettaConversationId?: string }) => void;
};

/**
 * Handle returned by runLetta for controlling the session.
 */
export type RunnerHandle = {
  abort: () => Promise<void>;
  sessionId: string;
  /** Settles after the stream closes and runner cleanup releases ownership. */
  done: Promise<void>;
};

/**
 * Context passed through the runner execution.
 */
export type RunnerContext = {
  sessionKey: string;
  currentSessionId: string;
  abortController: AbortController;
  signal: AbortSignal;
  agentName: string;
};
