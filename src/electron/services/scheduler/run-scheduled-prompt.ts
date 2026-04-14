import { runLetta } from "../../libs/runner/index.js";
import type { RunnerSession } from "../../libs/runner/types.js";
import type { PendingPermission } from "../../libs/runtime-state.js";
import type { ServerEvent } from "../../types.js";

function extractAssistantText(message: any): string | null {
  if (!message) return null;

  const content = (message as { content?: unknown }).content;
  if (!content) return null;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const text = content
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object") {
          if ("text" in item && typeof item.text === "string") return item.text;
          if ("content" in item && typeof (item as any).content === "string") return (item as any).content;
          if ("value" in item && typeof (item as any).value === "string") return (item as any).value;
        }
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
    return text || null;
  }

  return null;
}

/**
 * Headless runner used by the scheduler to execute prompts.
 */
export async function runScheduledPrompt(
  agentId: string,
  conversationId: string | null,
  prompt: string
): Promise<{ output: string | null; conversationId: string | null; error: string | null }> {
  const sessionId = conversationId ?? `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let actualConversationId = sessionId;

  const pendingPermissions = new Map<string, PendingPermission>();
  const session: RunnerSession = {
    id: sessionId,
    title: `Scheduled task (${sessionId})`,
    status: "running",
    pendingPermissions,
  };

  let latestAssistantText: string | null = null;
  let error: string | null = null;
  let finalStatus: "running" | "completed" | "error" = "running";

  let resolveStatus: (() => void) | null = null;
  const completionPromise = new Promise<void>((resolve) => {
    resolveStatus = resolve;
  });

  const maybeResolve = () => {
    if (resolveStatus) {
      resolveStatus();
      resolveStatus = null;
    }
  };

  const handleEvent = (event: ServerEvent) => {
    if (event.type === "stream.message" && event.payload.sessionId === actualConversationId) {
      const msg = event.payload.message as any;
      if (msg?.type === "assistant" || msg?.type === "assistant_message") {
        const text = extractAssistantText(msg);
        if (text) {
          latestAssistantText = text;
        }
      }
    }

    if (event.type === "session.status" && event.payload.sessionId === actualConversationId) {
      if (event.payload.status === "completed" || event.payload.status === "error") {
        finalStatus = event.payload.status;
        if (event.payload.error) {
          error = event.payload.error;
        }
        maybeResolve();
      }
    }

    if (event.type === "runner.error") {
      error = event.payload.message;
      finalStatus = "error";
      maybeResolve();
    }
  };

  await runLetta({
    prompt,
    session,
    preferredAgentId: agentId,
    resumeConversationId: conversationId ?? undefined,
    onEvent: handleEvent,
    onSessionUpdate: (updates) => {
      if (updates.lettaConversationId) {
        actualConversationId = updates.lettaConversationId;
      }
    },
  });

  await completionPromise;

  return {
    output: latestAssistantText,
    conversationId: actualConversationId,
    error: finalStatus === ("completed" as "running" | "completed" | "error") ? null : error ?? "Scheduled run failed",
  };
}