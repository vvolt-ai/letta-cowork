/**
 * Event processing and dispatching for the runner.
 */

import type { SDKMessage } from "@letta-ai/letta-code-sdk";
import type { ServerEvent } from "../../types.js";
import { debug } from "./logger.js";
import { createLettaClient } from "./client.js";

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
 * Recover a stuck conversation that has an orphaned pending approval.
 *
 * When the CLI runner fails with an approval conflict and the SDK's built-in
 * recovery can't resolve it (e.g., the CLI process is gone), the conversation
 * gets stuck — the Letta API blocks new messages until the pending approval
 * is resolved. We recover by sending a message directly via the REST API,
 * which bypasses the CLI approval gate and clears the stuck state.
 */
async function recoverApprovalConflict(
  agentId: string | null | undefined,
  conversationId: string | null | undefined,
): Promise<boolean> {
  if (!agentId || !conversationId) {
    debug("recoverApprovalConflict: missing agentId or conversationId, skipping");
    return false;
  }

  const client = createLettaClient();
  if (!client) {
    debug("recoverApprovalConflict: no Letta client available");
    return false;
  }

  try {
    debug("recoverApprovalConflict: sending recovery message via API", { agentId, conversationId });
    await client.agents.messages.create(agentId, {
      messages: [{ role: "user", content: "[system] Pending approval cleared — please continue." }],
    });
    debug("recoverApprovalConflict: recovery message sent successfully");
    return true;
  } catch (err) {
    debug("recoverApprovalConflict: failed to send recovery message", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Handle a result message.
 *
 * When the result indicates an approval conflict (the conversation is stuck
 * because of an orphaned pending tool approval), automatically attempts
 * recovery via the Letta API so the conversation doesn't remain blocked.
 */
export function handleResultMessage(
  message: SDKMessage & { type: "result"; success: boolean },
  currentSessionId: string,
  onEvent: (event: ServerEvent) => void,
  agentName?: string,
  agentId?: string | null,
  conversationId?: string | null,
): void {
  const status = message.success ? "completed" : "error";
  debug("result received", {
    success: message.success,
    status,
    errorCode: (message as any).errorCode,
    approvalConflict: (message as any).approvalConflict,
  });

  // Auto-recover from approval conflicts
  const isApprovalConflict =
    (message as any).approvalConflict === true ||
    (message as any).errorCode === "approval_conflict" ||
    (message as any).errorCode === "approval_conflict_terminal";

  if (isApprovalConflict) {
    debug("approval conflict detected, attempting auto-recovery", {
      agentId,
      conversationId,
      errorCode: (message as any).errorCode,
      errorDetail: (message as any).errorDetail,
    });

    // Fire-and-forget recovery — don't block the result handler
    recoverApprovalConflict(agentId, conversationId).then((recovered) => {
      if (recovered) {
        debug("approval conflict auto-recovered successfully");
        // Send a "completed" status since the conversation is now unblocked
        sendSessionStatus(currentSessionId, "completed", onEvent, agentName);
      } else {
        debug("approval conflict auto-recovery failed, conversation may be stuck");
        sendSessionStatus(currentSessionId, "error", onEvent, agentName,
          "Session stuck due to pending approval. Try sending a new message to resume.");
      }
    });

    // Don't send error status immediately — wait for recovery result
    sendSessionStatus(currentSessionId, "running", onEvent, agentName);
    return;
  }

  sendSessionStatus(currentSessionId, status, onEvent, agentName);
}
