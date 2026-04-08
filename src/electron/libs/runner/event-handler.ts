/**
 * Event processing and dispatching for the runner.
 */

import type { SDKMessage } from "@letta-ai/letta-code-sdk";
import type { ServerEvent } from "../../types.js";
import { debug } from "./logger.js";

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
    message: message,
    type: message.type,
    count: messageCount,
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

  if (message.type === "tool_call" || message.type === "tool_result") {
    debug("tool payload detail", {
      type: message.type,
      keys: Object.keys((message as unknown as Record<string, unknown>) ?? {}),
      payload: (() => {
        try {
          return JSON.parse(JSON.stringify(message));
        } catch {
          return { failedToSerialize: true };
        }
      })(),
    });
  }
}

/**
 * Handle a result message.
 */
export function handleResultMessage(
  message: SDKMessage & { type: "result"; success: boolean },
  currentSessionId: string,
  onEvent: (event: ServerEvent) => void,
  agentName?: string
): void {
  const status = message.success ? "completed" : "error";
  debug("result received", { success: message.success, status });
  sendSessionStatus(currentSessionId, status, onEvent, agentName);
}
