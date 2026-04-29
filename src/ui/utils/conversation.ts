import type { StreamMessage, SDKAssistantMessage } from "../types";

export type ConversationStreamMessage = StreamMessage & { createdAt?: number; historyOrder?: number; id?: string; uuid?: string };

const isUserPrompt = (message: StreamMessage): message is ConversationStreamMessage & { type: "user_prompt" } =>
  message.type === "user_prompt";

const isAssistantMessage = (message: StreamMessage): message is SDKAssistantMessage & { createdAt?: number } =>
  message.type === "assistant";

const isToolMessage = (message: StreamMessage): message is ConversationStreamMessage & { toolCallId?: string } =>
  message.type === "tool_call" || message.type === "tool_result";

export function filterConversationMessages(messages: ConversationStreamMessage[]): ConversationStreamMessage[] {
  return messages.filter((message) => isUserPrompt(message) || isAssistantMessage(message) || isToolMessage(message));
}

export function takeLastConversationMessages(messages: ConversationStreamMessage[], limit: number): ConversationStreamMessage[] {
  const ordered = [...messages].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  if (ordered.length <= limit) return ordered;
  return ordered.slice(-limit);
}

export function getConversationMessageId(message: ConversationStreamMessage): string | undefined {
  if (isUserPrompt(message)) return message.id;
  if (isAssistantMessage(message)) return message.uuid;
  if (isToolMessage(message)) {
    const toolCallId = (message as any).toolCallId ?? (message as any).uuid ?? (message as any).id;
    if (!toolCallId) return undefined;
    const suffix = message.type === "tool_call" ? "::call" : "::result";
    return `${toolCallId}${suffix}`;
  }
  if (message.type === "reasoning" && (message as any).uuid) {
    return `${(message as any).uuid}::reasoning`;
  }
  return undefined;
}

/**
 * Compute a content-based fingerprint for assistant messages.
 * Used as a dedup fallback when UUID-based dedup fails (e.g., stream UUID
 * differs from API history ID for the same message).
 */
function assistantContentFingerprint(message: ConversationStreamMessage): string | undefined {
  if (message.type !== "assistant") return undefined;
  const content = typeof (message as any).content === "string" ? (message as any).content : undefined;
  if (!content || content.length < 10) return undefined; // too short to fingerprint reliably
  // Use first 200 chars + length as a fingerprint
  const preview = content.slice(0, 200);
  return `assistant:${content.length}:${preview}`;
}

export function mergeConversationHistory(
  existing: ConversationStreamMessage[],
  incoming: ConversationStreamMessage[],
): ConversationStreamMessage[] {
  const merged: ConversationStreamMessage[] = [];
  const seenById = new Set<string>();
  const seenByContent = new Map<string, number>(); // fingerprint -> index in merged

  const sorted = [...existing, ...incoming].sort((a, b) => {
    const aCreatedAt = typeof a.createdAt === "number" && Number.isFinite(a.createdAt) ? a.createdAt : undefined;
    const bCreatedAt = typeof b.createdAt === "number" && Number.isFinite(b.createdAt) ? b.createdAt : undefined;

    if (aCreatedAt !== undefined && bCreatedAt !== undefined && aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    if (aCreatedAt !== undefined && bCreatedAt === undefined) return -1;
    if (aCreatedAt === undefined && bCreatedAt !== undefined) return 1;

    const aHistoryOrder = typeof a.historyOrder === "number" ? a.historyOrder : 0;
    const bHistoryOrder = typeof b.historyOrder === "number" ? b.historyOrder : 0;
    if (aHistoryOrder !== bHistoryOrder) {
      return aHistoryOrder - bHistoryOrder;
    }

    return 0;
  });

  for (const message of sorted) {
    const id = getConversationMessageId(message);

    // ID-based dedup (primary)
    if (id && seenById.has(id)) {
      console.debug("[conversation] mergeConversationHistory DEDUP (id) skipped", {
        id,
        type: message.type,
        uuid: (message as any).uuid,
        contentPreview: typeof (message as any).content === "string" ? (message as any).content.slice(0, 80) : undefined,
      });
      continue;
    }

    // Content-based dedup for assistant messages (fallback when UUIDs don't match)
    const fingerprint = assistantContentFingerprint(message);
    if (fingerprint && seenByContent.has(fingerprint)) {
      console.debug("[conversation] mergeConversationHistory DEDUP (content) skipped", {
        fingerprint,
        type: message.type,
        uuid: (message as any).uuid,
        contentPreview: typeof (message as any).content === "string" ? (message as any).content.slice(0, 80) : undefined,
      });
      // Replace the earlier copy with this one (history version is more authoritative)
      const existingIdx = seenByContent.get(fingerprint)!;
      merged[existingIdx] = message;
      // Update the ID set with the new message's ID if it has one
      if (id) seenById.add(id);
      continue;
    }

    if (id) seenById.add(id);
    if (fingerprint) seenByContent.set(fingerprint, merged.length);
    merged.push(message);
  }

  const duplicates = sorted.length - merged.length;
  if (duplicates > 0) {
    console.debug("[conversation] mergeConversationHistory deduped messages", {
      duplicates,
      before: sorted.length,
      after: merged.length,
    });
  }

  return merged;
}
