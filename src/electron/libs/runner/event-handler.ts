/**
 * Event processing and dispatching for the runner.
 */

import { debug } from "./logger.js";

import type { ServerEvent } from "../../types.js";
import type { SDKMessage } from "@letta-ai/letta-agent-sdk";

/**
 * Create an event sender for streaming messages.
 */
export function createMessageSender(
  currentSessionId: string,
  onEvent: (event: ServerEvent) => void
): (message: SDKMessage) => void {
  return (message: SDKMessage) => {
    onEvent({
      type: "stream.message",
      payload: { sessionId: currentSessionId, message }
    });
  };
}

/**
 * Create a permission request sender.
 */
export function createPermissionRequestSender(
  currentSessionId: string,
  onEvent: (event: ServerEvent) => void
): (toolUseId: string, toolName: string, input: unknown) => void {
  return (toolUseId: string, toolName: string, input: unknown) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: currentSessionId, toolUseId, toolName, input }
    });
  };
}

/**
 * Send a session status event.
 */
export function sendSessionStatus(
  currentSessionId: string,
  status: "idle" | "running" | "completed" | "error",
  onEvent: (event: ServerEvent) => void,
  agentName?: string,
  error?: string
): void {
  onEvent({
    type: "session.status",
    payload: {
      sessionId: currentSessionId,
      status,
      title: currentSessionId,
      agentName,
      error
    }
  });
}

/**
 * Log message details for debugging.
 */
export function logMessageDetails(message: SDKMessage, messageCount: number): void {
  debug("received message", {
    type: message.type,
    count: messageCount,
    errorCode: message.type === 'error' || message.type === 'result' ? (message as any).errorCode : undefined,
    errorMessage: message.type === 'error' || message.type === 'result' ? (message as any).error ?? (message as any).message ?? (message as any).errorDetail : undefined,
    toolName: (message as any).toolName ?? (message as any).name ?? (message as any).tool_name,
    toolCallId: (message as any).toolCallId ?? (message as any).tool_call_id,
    inputPreview: (() => {
      const raw = (message as any).toolInput ?? (message as any).input ?? (message as any).arguments ?? (message as any).rawArguments;
      try {
        return typeof raw === "string" ? raw.slice(0, 120) : raw ? JSON.stringify(raw).slice(0, 120) : undefined;
      } catch {
        return undefined;
      }
    })(),
    outputPreview: (() => {
      const raw = (message as any).tool_return ?? (message as any).output ?? (message as any).result ?? (message as any).content;
      try {
        return typeof raw === "string" ? raw.slice(0, 120) : raw ? JSON.stringify(raw).slice(0, 120) : undefined;
      } catch {
        return undefined;
      }
    })(),
  });
}

/**
 * Handle a result message.
 *
 * SDK results are observations only. Recovery must stay in the owned SDK
 * execution; a UI callback never submits a second direct REST model turn.
 */
export function handleResultMessage(
  message: SDKMessage & { type: "result"; success: boolean },
  currentSessionId: string,
  onEvent: (event: ServerEvent) => void,
  agentName?: string,
  _agentId?: string | null,
  _conversationId?: string | null,
): void {
  const status = message.success ? "completed" : "error";
  debug("result received", {
    success: message.success,
    status,
    errorCode: (message as any).errorCode,
    approvalConflict: (message as any).approvalConflict,
  });

  // Propagate the error string carried on the result message (set e.g. by
  // native SDK with its underlying API error)
  // so headless callers like runScheduledPrompt see the real cause instead
  // of a bare status=error.
  const resultError =
    status === "error"
      ? (message as any).error ?? (message as any).errorDetail ?? (message as any).errorMessage
      : undefined;
  sendSessionStatus(
    currentSessionId,
    status,
    onEvent,
    agentName,
    typeof resultError === "string" && resultError.length > 0
      ? resultError
      : undefined,
  );
}
