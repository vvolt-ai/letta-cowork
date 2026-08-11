/**
 * Type definitions for the runner module.
 */

import type { ServerEvent } from "../../types.js";
import type { PendingPermission } from "../runtime-state.js";
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
};

/** Session surface shared by the SDK and Cowork's REST-streaming adapter. */
export type RunnerLettaSession = {
  initialize(): Promise<SDKInitMessage>;
  send(message: SendMessage): Promise<void>;
  stream(): AsyncGenerator<SDKMessage>;
  abort(): Promise<void>;
  readonly agentId: string | null;
  readonly conversationId: string | null;
};

/**
 * Options for running a Letta session.
 */
export type RunnerOptions = {
  prompt: string;
  content?: MessageContentItem[];
  session: RunnerSession;
  resumeConversationId?: string;
  preferredAgentId?: string;
  model?: string;
  permissionMode?: "standard" | "acceptEdits" | "unrestricted";
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
