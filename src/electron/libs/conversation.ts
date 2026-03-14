import { randomUUID } from "node:crypto";

import type { StreamMessage } from "../types.js";

interface LettaMessageContentSource {
  type?: string;
  url?: string;
  image_url?: string;
  data?: string;
  mime_type?: string;
  media_type?: string;
  file_id?: string;
  file_name?: string;
  size?: number;
  [key: string]: unknown;
}

interface LettaMessageContent {
  type?: string;
  text?: string;
  reasoning?: string;
  source?: LettaMessageContentSource;
  url?: string;
  image_url?: string;
  data?: string;
  mime_type?: string;
  media_type?: string;
  file_id?: string;
  file_name?: string;
  size?: number;
  [key: string]: unknown;
}

function firstPresent<T>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    return value;
  }
  return undefined;
}

function extractText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const pieces: string[] = [];
    for (const block of value) {
      if (!block) continue;
      if (typeof block === "string") {
        pieces.push(block);
      } else if (typeof block === "object") {
        const maybeText = (block as any).text ?? (block as any).reasoning;
        if (typeof maybeText === "string") pieces.push(maybeText);
      }
    }
    return pieces.join("\n");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value ?? "");
}

function isMeaningfulText(text: string | null | undefined): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed === "{}" || trimmed === "[]") return false;
  if (/^\{\s*\}$/.test(trimmed)) return false;
  if (/^\[\s*\]$/.test(trimmed)) return false;
  if (/^\{\s*"?type"?\s*:\s*"?\w+"?\s*\}$/.test(trimmed)) return false;
  return trimmed.length > 0;
}

function toStringOrNull(value: unknown): string | null {
  const text = extractText(value);
  return isMeaningfulText(text) ? text : null;
}

function shouldSkipToolName(name: string | undefined | null): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  return normalized === "tool_return_message" || normalized === "approval_request_message" || normalized === "approval_response_message";
}

function shouldSkipLabelText(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text.trim().replace(/^\(+|\)+$/g, "").toLowerCase();
  return shouldSkipToolName(normalized);
}

function normaliseLogs(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (typeof entry === "string") return entry;
      try {
        return JSON.stringify(entry);
      } catch {
        return String(entry ?? "");
      }
    });
  }
  return [extractText(value)];
}

export interface LettaMessage {
  id?: string;
  message_id?: string;
  message_type?: string;
  type?: string;
  created_at?: number;
  content?: LettaMessageContent[] | string | null | unknown;
}

export type ConversationStreamMessage = StreamMessage & { createdAt?: number; id?: string; uuid?: string };

export interface NormalisedHistoryBatch {
  messages: ConversationStreamMessage[];
  hasMore: boolean;
  nextBefore?: string;
  allFiltered: ConversationStreamMessage[];
}

export function filterConversationMessages(rawMessages: LettaMessage[]): ConversationStreamMessage[] {
  const result: ConversationStreamMessage[] = [];

  for (const msg of rawMessages) {
    const type = msg.message_type || msg.type;
    const metadata = (msg as any).metadata ?? {};

    if (type === "user_message") {
      const content = msg.content;
      let promptText = "";
      const attachments: { id: string; name: string; mimeType: string; size: number; url: string; kind: "image" | "file" }[] = [];

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "text" && typeof block.text === "string") {
            promptText = block.text;
          }
          if (block?.type === "image") {
            const source = block.source ?? block;
            const url = (source?.url || source?.image_url || source?.data) as string | undefined;
            if (url) {
              attachments.push({
                id: (source?.file_id as string | undefined) || msg.id || randomUUID(),
                name: (source?.file_name as string | undefined) || "image",
                mimeType: (source?.mime_type as string | undefined) || (source?.media_type as string | undefined) || "image/*",
                size: Number(source?.size) || 0,
                url,
                kind: "image",
              });
            }
          }
        }
      } else if (typeof content === "string") {
        promptText = content;
      } else if (content) {
        try {
          promptText = JSON.stringify(content);
        } catch {
          promptText = String(content);
        }
      }

      const id = msg.id || msg.message_id || randomUUID();
      const userMessage: ConversationStreamMessage = {
        type: "user_prompt",
        prompt: promptText,
        attachments: attachments.length ? attachments : undefined,
        id,
        createdAt: msg.created_at ?? Date.now(),
      } as ConversationStreamMessage;
      result.push(userMessage);
      continue;
    }

    if (type === "assistant_message") {
      const textContent = extractText(msg.content ?? metadata);
      const assistantMessage: ConversationStreamMessage = {
        type: "assistant",
        content: textContent,
        uuid: msg.id || msg.message_id || randomUUID(),
        createdAt: msg.created_at ?? Date.now(),
      } as ConversationStreamMessage;
      result.push(assistantMessage);
      continue;
    }

    if (type === "tool_call" || type === "tool_message") {
      const toolCallId = (msg as any).tool_call_id || metadata.tool_call_id || metadata.call_id || msg.id || msg.message_id || randomUUID();
      const toolName = firstPresent(
        (msg as any).tool_name as string | undefined,
        metadata.tool_name as string | undefined,
        metadata.name as string | undefined,
        (msg as any).name as string | undefined,
      ) || "tool";
      const toolInput = firstPresent(
        (msg as any).tool_input,
        (msg as any).input,
        (msg as any).arguments,
        metadata.tool_input,
        metadata.input,
        metadata.arguments,
        msg.content
      );
      const toolInputText = toStringOrNull(toolInput) ?? "(no arguments)";

      if (shouldSkipToolName(toolName)) {
        continue;
      }

      const toolCallMessage: ConversationStreamMessage = {
        type: "tool_call",
        toolCallId,
        toolName,
        toolInput: toolInputText,
        uuid: toolCallId,
        createdAt: msg.created_at ?? Date.now(),
      } as unknown as ConversationStreamMessage;
      result.push(toolCallMessage);
      continue;
    }

    if (type === "tool_result") {
      const toolCallId = (msg as any).tool_call_id || metadata.tool_call_id || metadata.call_id || msg.id || msg.message_id || randomUUID();
      const toolName = firstPresent(
        (msg as any).tool_name as string | undefined,
        metadata.tool_name as string | undefined,
        metadata.name as string | undefined,
        (msg as any).name as string | undefined,
      ) || "tool";
      const outputRaw = firstPresent(
        (msg as any).output,
        (msg as any).result,
        metadata.output,
        metadata.result,
        msg.content
      );
      const outputText = toStringOrNull(outputRaw);
      const logsRaw = firstPresent((msg as any).logs, metadata.logs, metadata.tool_logs);
      const logs = normaliseLogs(logsRaw);
      const isError = Boolean((msg as any).status === "failed" || metadata.error || metadata.is_error);

      if (shouldSkipToolName(toolName)) {
        continue;
      }

      const toolResultMessage: ConversationStreamMessage = {
        type: "tool_result",
        toolCallId,
        toolName,
        output: outputText ?? (logs.length > 0 ? logs.join("\n") : "(no output)"),
        logs,
        isError,
        uuid: msg.id || msg.message_id || randomUUID(),
        createdAt: msg.created_at ?? Date.now(),
      } as unknown as ConversationStreamMessage;
      result.push(toolResultMessage);
      continue;
    }

    if (type === "reasoning" || type === "reasoning_message") {
      const reasoningText = extractText(firstPresent(msg.content, metadata.reasoning, metadata.text));
      if (reasoningText.trim().length > 0) {
        const reasoningMessage: ConversationStreamMessage = {
          type: "reasoning",
          content: reasoningText,
          uuid: msg.id || msg.message_id || randomUUID(),
          createdAt: msg.created_at ?? Date.now(),
        } as unknown as ConversationStreamMessage;
        result.push(reasoningMessage);
      }
      continue;
    }

    if (type === "system_message") {
      const textContent = extractText(msg.content ?? metadata);
      if (textContent.trim().length > 0) {
        const systemMessage: ConversationStreamMessage = {
          type: "assistant",
          content: textContent,
          uuid: msg.id || msg.message_id || randomUUID(),
          createdAt: msg.created_at ?? Date.now(),
        } as ConversationStreamMessage;
        result.push(systemMessage);
      }
      continue;
    }

    if (type === "approval_request_message" || type === "approval_response_message") {
      continue;
    }

    if (type) {
      const fallbackText = toStringOrNull(firstPresent(msg.content, metadata)) ?? `(${type})`;
      if (shouldSkipLabelText(fallbackText)) {
        continue;
      }
      const fallbackMessage: ConversationStreamMessage = {
        type: "assistant",
        content: fallbackText,
        uuid: msg.id || msg.message_id || randomUUID(),
        createdAt: msg.created_at ?? Date.now(),
      } as ConversationStreamMessage;
      result.push(fallbackMessage);
    }
  }

  return result;
}

export function takeLastConversationMessages(messages: StreamMessage[], limit: number): StreamMessage[] {
  if (messages.length <= limit) {
    return [...messages];
  }
  return messages.slice(-limit);
}

export function normaliseHistoryBatch(rawMessages: LettaMessage[], limit: number): NormalisedHistoryBatch {
  const filtered = filterConversationMessages(rawMessages);
  const ordered = filtered.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const limited = ordered.slice(-limit);
  const hasMore = ordered.length > limited.length;
  const messagesChronological = limited;
  const oldest = messagesChronological[0];
  const nextBefore = oldest ? (oldest.uuid || (oldest as any).id) : undefined;

  console.debug("[conversation] normaliseHistoryBatch", {
    requestedLimit: limit,
    totalRaw: rawMessages.length,
    filtered: ordered.length,
    delivered: messagesChronological.length,
    hasMore,
    nextBefore,
  });

  return {
    messages: messagesChronological,
    hasMore,
    nextBefore,
    allFiltered: ordered,
  };
}
