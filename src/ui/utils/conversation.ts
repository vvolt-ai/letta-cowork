import type { StreamMessage, SDKAssistantMessage } from "../types";

export type ConversationStreamMessage = StreamMessage & { createdAt?: number; id?: string; uuid?: string };

const isUserPrompt = (message: StreamMessage): message is ConversationStreamMessage & { type: "user_prompt" } =>
  message.type === "user_prompt";

const isAssistantMessage = (message: StreamMessage): message is SDKAssistantMessage & { createdAt?: number } =>
  message.type === "assistant";

export function filterConversationMessages(messages: ConversationStreamMessage[]): ConversationStreamMessage[] {
  return messages.filter((message) => isUserPrompt(message) || isAssistantMessage(message));
}

export function takeLastConversationMessages(messages: ConversationStreamMessage[], limit: number): ConversationStreamMessage[] {
  const ordered = [...messages].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  if (ordered.length <= limit) return ordered;
  return ordered.slice(-limit);
}

export function getConversationMessageId(message: ConversationStreamMessage): string | undefined {
  if (isUserPrompt(message)) return message.id;
  if (isAssistantMessage(message)) return message.uuid;
  return undefined;
}

export function mergeConversationHistory(
  existing: ConversationStreamMessage[],
  incoming: ConversationStreamMessage[],
): ConversationStreamMessage[] {
  const merged: ConversationStreamMessage[] = [];
  const seen = new Set<string>();

  const sorted = [...existing, ...incoming].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  for (const message of sorted) {
    const id = getConversationMessageId(message);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
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
