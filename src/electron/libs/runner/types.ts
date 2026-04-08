/**
 * Type definitions for the runner module.
 */

import type { MessageContentItem } from "@letta-ai/letta-code-sdk";
import type { ServerEvent } from "../../types.js";
import type { PendingPermission } from "../runtime-state.js";

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
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: { lettaConversationId?: string }) => void;
};

/**
 * Handle returned by runLetta for controlling the session.
 */
export type RunnerHandle = {
  abort: () => Promise<void>;
  sessionId: string;
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
