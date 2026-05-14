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

  // Capture EVERY assistant message the agent emits during the run.
  // Keyed by message id so that streaming events that re-emit the same
  // logical message (partial -> final, or duplicated finalize) don't
  // produce duplicates. Order is preserved by Map iteration semantics.
  // Messages without an id fall through to a monotonically-numbered key
  // so the chronological order is still preserved.
  const assistantTexts = new Map<string, string>();
  let nextAnonymousId = 0;

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
    // Note: the original sessionId filter on stream / status events was
    // dropped intentionally. runScheduledPrompt only ever runs ONE session
    // per call, so any event we see belongs to it; filtering by
    // actualConversationId can race with onSessionUpdate and silently drop
    // the very status event we are waiting for.
    if (event.type === "stream.message") {
      const msg = event.payload.message as any;
      if (msg?.type === "assistant" || msg?.type === "assistant_message") {
        const text = extractAssistantText(msg);
        if (text) {
          // Use the message id when present so streaming updates to the
          // same message overwrite in place. Fall back to a synthetic
          // key for messages that arrive without one.
          const key =
            typeof msg.id === "string" && msg.id.length > 0
              ? msg.id
              : `__anon_${nextAnonymousId++}`;
          assistantTexts.set(key, text);
        }
      }
    }

    if (event.type === "session.status") {
      if (event.payload.status === "completed" || event.payload.status === "error") {
        finalStatus = event.payload.status;
        if (event.payload.error) {
          error = event.payload.error;
        } else if (event.payload.status === "error") {
          // status=error but no error string - capture so diagnostics aren't empty
          error = "Session ended with status=error (no error message provided by runner)";
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

  try {
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
  } catch (err) {
    // runLetta itself rejected (e.g. session.initialize() threw because of
    // a 404 agent or invalid API key). Capture the message so the caller
    // sees the real cause instead of the generic fallback.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[runScheduledPrompt] runLetta threw:", err);
    error = message;
    finalStatus = "error";
    maybeResolve();
  }

  await completionPromise;

  // Join all assistant messages in the order they were emitted. Blank
  // line between messages so multi-part responses (e.g. "here's the
  // summary" followed by "want me to send it elsewhere?") read as
  // separate paragraphs in the notification.
  const output =
    assistantTexts.size === 0
      ? null
      : Array.from(assistantTexts.values()).join("\n\n");

  return {
    output,
    conversationId: actualConversationId,
    error: finalStatus === ("completed" as "running" | "completed" | "error") ? null : error ?? "Scheduled run failed",
  };
}