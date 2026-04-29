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
        const record = block as any;
        const maybeText = record.text ?? record.reasoning ?? record.content ?? record.output ?? record.result;
        if (typeof maybeText === "string") pieces.push(maybeText);
      }
    }
    return pieces.join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["command", "file_path", "query", "pattern", "url", "description", "text", "reasoning", "content", "output", "result"];
    for (const key of preferredKeys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
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
  uuid?: string;
  message_type?: string;
  type?: string;
  created_at?: number;
  date?: string;
  timestamp?: string | number;
  content?: LettaMessageContent[] | string | null | unknown;
}

export type ConversationStreamMessage = StreamMessage & { createdAt?: number; historyOrder?: number; id?: string; uuid?: string };

function resolveHistoryTimestamp(msg: LettaMessage, metadata: Record<string, unknown>): number | undefined {
  if (typeof msg.created_at === "number" && Number.isFinite(msg.created_at)) {
    return msg.created_at;
  }

  const candidates: unknown[] = [
    msg.date,
    msg.timestamp,
    metadata.date,
    metadata.timestamp,
    metadata.created_at,
    metadata.createdAt,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const numeric = Number(candidate);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

export interface NormalisedHistoryBatch {
  messages: ConversationStreamMessage[];
  hasMore: boolean;
  nextBefore?: string;
  allFiltered: ConversationStreamMessage[];
}

export function filterConversationMessages(rawMessages: LettaMessage[]): ConversationStreamMessage[] {
  const result: ConversationStreamMessage[] = [];

  for (const [rawIndex, msg] of rawMessages.entries()) {
    const type = msg.message_type || msg.type;
    const metadata = (msg as any).metadata ?? {};
    const historyOrder = rawIndex;
    const createdAt = resolveHistoryTimestamp(msg, metadata);

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
        createdAt,
        historyOrder,
      } as ConversationStreamMessage;
      result.push(userMessage);
      continue;
    }

    if (type === "assistant_message") {
      const textContent = extractText(msg.content ?? metadata);
      const assistantMessage: ConversationStreamMessage = {
        type: "assistant",
        content: textContent,
        uuid: msg.uuid || msg.id || msg.message_id || randomUUID(),
        createdAt,
        historyOrder,
      } as ConversationStreamMessage;
      result.push(assistantMessage);
      continue;
    }

    if (type === "tool_call" || type === "tool_message" || type === "tool_call_message") {
      const nestedToolCall = ((msg as any).tool_call ?? metadata.tool_call ?? {}) as Record<string, unknown>;
      const toolCallId = (msg as any).tool_call_id || nestedToolCall.tool_call_id || metadata.tool_call_id || metadata.call_id || msg.id || msg.message_id || randomUUID();
      const toolName = firstPresent(
        nestedToolCall.name as string | undefined,
        (msg as any).tool_name as string | undefined,
        metadata.tool_name as string | undefined,
        metadata.name as string | undefined,
        (msg as any).name as string | undefined,
      ) || "tool";
      const toolInput = firstPresent(
        nestedToolCall.arguments,
        (msg as any).tool_input,
        (msg as any).input,
        (msg as any).arguments,
        (msg as any).raw_arguments,
        metadata.tool_input,
        metadata.input,
        metadata.arguments,
        metadata.raw_arguments,
        metadata.command,
        metadata.file_path,
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
        createdAt,
        historyOrder,
      } as unknown as ConversationStreamMessage;
      result.push(toolCallMessage);
      continue;
    }

    if (type === "tool_result" || type === "tool_return_message") {
      const toolCallId = (msg as any).tool_call_id || metadata.tool_call_id || metadata.call_id || msg.id || msg.message_id || randomUUID();
      const toolName = firstPresent(
        metadata.tool_name as string | undefined,
        metadata.name as string | undefined,
        (msg as any).tool_name as string | undefined,
        (msg as any).name as string | undefined,
      ) || "tool";
      const outputRaw = firstPresent(
        (msg as any).tool_return,
        (msg as any).output,
        (msg as any).result,
        (msg as any).content,
        metadata.tool_return,
        metadata.output,
        metadata.result,
        metadata.stdout,
        metadata.stderr,
        msg.content
      );
      const outputText = toStringOrNull(outputRaw);
      const logsRaw = firstPresent((msg as any).logs, (msg as any).stdout, (msg as any).stderr, metadata.logs, metadata.tool_logs, metadata.stdout, metadata.stderr);
      const logs = normaliseLogs(logsRaw);
      const isError = Boolean((msg as any).status === "failed" || (msg as any).status === "error" || metadata.error || metadata.is_error);

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
        createdAt,
        historyOrder,
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
          createdAt,
          historyOrder,
        } as unknown as ConversationStreamMessage;
        result.push(reasoningMessage);
      }
      continue;
    }

    if (type === "system_message") {
      // Skip system messages - they contain internal system prompt and memory info
      // that is not relevant to the user
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
        createdAt,
        historyOrder,
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
  const ordered = filtered.sort((a, b) => {
    const aCreatedAt = typeof a.createdAt === "number" && Number.isFinite(a.createdAt) ? a.createdAt : undefined;
    const bCreatedAt = typeof b.createdAt === "number" && Number.isFinite(b.createdAt) ? b.createdAt : undefined;

    if (aCreatedAt !== undefined && bCreatedAt !== undefined && aCreatedAt !== bCreatedAt) {
      return aCreatedAt - bCreatedAt;
    }

    if (aCreatedAt !== undefined && bCreatedAt === undefined) return -1;
    if (aCreatedAt === undefined && bCreatedAt !== undefined) return 1;

    const aHistoryOrder = typeof a.historyOrder === "number" ? a.historyOrder : 0;
    const bHistoryOrder = typeof b.historyOrder === "number" ? b.historyOrder : 0;
    return aHistoryOrder - bHistoryOrder;
  });
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
