/**
 * Message grouping utilities for ChatTimeline
 */

import type { SDKToolResultMessage } from "../../../../../types";
import type { ToolTimelineEntry } from "../../../types";
// truncateInput is imported for use by useChatTimeline hook

/**
 * Validates if a string contains meaningful content for tool display
 */
export function isMeaningfulToolString(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed === "?" || trimmed === "??") return false;
  if (/^[\s"'`]*[\]\[{}()]+[\s"'`]*$/.test(trimmed)) return false;
  const stripped = trimmed.replace(/["'`]/g, "");
  if (!stripped) return false;
  const meaningless = new Set(["{}", "[]", "{", "}", "[", "]", "()"]);
  if (meaningless.has(stripped)) return false;
  return true;
}

/**
 * Stringifies an object value for tool display
 */
export function stringifyObjectValue(value: Record<string, unknown>): string | undefined {
  const keys = Object.keys(value);
  if (keys.length === 0) return undefined;

  // Special-case common structures that only contain a raw placeholder
  if (keys.length === 1 && keys[0] === "raw") {
    const rawValue = value.raw;
    if (typeof rawValue === "string" && isMeaningfulToolString(rawValue)) {
      return rawValue.trim();
    }
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    const trimmedSerialized = serialized.trim();
    return isMeaningfulToolString(trimmedSerialized) ? trimmedSerialized : undefined;
  } catch {
    const pieces: string[] = [];
    for (const key of keys) {
      const candidateValue = value[key];
      const formatted = formatToolText(candidateValue);
      if (formatted) {
        pieces.push(`${key}: ${formatted}`);
      }
    }
    return pieces.length > 0 ? pieces.join("\n") : undefined;
  }
}

/**
 * Formats tool text for display
 */
export function formatToolText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return isMeaningfulToolString(trimmed) ? trimmed : undefined;
  }
  if (typeof value === "object") {
    return stringifyObjectValue(value as Record<string, unknown>);
  }
  const stringified = String(value ?? "").trim();
  return isMeaningfulToolString(stringified) ? stringified : undefined;
}

/**
 * Normalizes reasoning content into an array of steps
 */
export function normalizeReasoning(content: unknown): string[] {
  if (!content) return [];
  const asString = typeof content === "string" ? content : String(content ?? "");
  return asString
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Collects log entries from various sources
 */
export function collectLogEntries(source: unknown, label?: string): string[] {
  if (source == null) return [];
  const items = Array.isArray(source) ? source : [source];
  return items
    .map((item) => {
      const formatted = formatToolText(item);
      const fallback =
        formatted ??
        (typeof item === "string" && isMeaningfulToolString(item.trim()) ? item.trim() : undefined);
      if (!fallback || fallback.length === 0) return undefined;
      return label ? `${label}: ${fallback}` : fallback;
    })
    .filter((entry): entry is string => Boolean(entry));
}

/**
 * Checks if a tool name is generic/placeholder
 */
export function isGenericToolName(name: string | undefined | null): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase();
  return normalized.length === 0 || normalized === "tool" || normalized === "?";
}

/**
 * Resolves a tool name from various possible formats
 */
export function resolveToolName(rawName: unknown, fallback?: string): string {
  const candidates = [
    typeof rawName === "string" ? rawName : undefined,
    fallback,
    "Tool",
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (isMeaningfulToolString(trimmed)) {
        return trimmed;
      }
    }
  }
  return "Tool";
}

/**
 * Extracts tool output and logs from a tool result message
 */
export function extractToolOutput(message: SDKToolResultMessage & { [key: string]: unknown }): {
  output?: string;
  logs?: string[];
} {
  const rawOutput = (message as any).tool_return ?? message.content ?? message.output ?? message.result ?? null;
  const output = formatToolText(rawOutput);

  const logs = [
    ...collectLogEntries((message as any).stdout, "stdout"),
    ...collectLogEntries((message as any).stderr, "stderr"),
    ...collectLogEntries(message.logs),
  ];

  return { output, logs };
}

/**
 * Merges tool entry logs
 */
export function mergeToolEntryLogs(existing?: string[], incoming?: string[]): string[] | undefined {
  const merged = Array.from(new Set([...(existing ?? []), ...(incoming ?? [])]));
  return merged.length > 0 ? merged : undefined;
}

/**
 * Merges tool entry output
 */
export function mergeToolEntryOutput(existing?: string | null, incoming?: string | null): string | undefined {
  const nextIncoming = incoming?.trim();
  const nextExisting = existing?.trim();

  if (!nextIncoming) return nextExisting || undefined;
  if (!nextExisting) return nextIncoming;

  if (nextExisting === nextIncoming) return nextExisting;
  if (nextExisting.includes(nextIncoming)) return nextExisting;
  if (nextIncoming.includes(nextExisting)) return nextIncoming;

  return `${nextExisting}\n${nextIncoming}`;
}

/**
 * Converts a ToolExecution to a ToolTimelineEntry
 */
export function toolExecutionToTimelineEntry(tool: {
  id: string;
  name: string;
  input: unknown;
  output?: string;
  status: "running" | "completed" | "failed";
  updates: string[];
}): ToolTimelineEntry {
  const resolvedName = resolveToolName(tool.name, "Tool");
  const derivedOutput = formatToolText(tool.output) ?? (tool.updates.length > 0 ? tool.updates.join("\n") : undefined);
  return {
    kind: "tool",
    id: tool.id,
    name: resolvedName,
    input: formatToolText(tool.input) ?? (typeof tool.input === "string" ? tool.input : undefined),
    output: derivedOutput,
    logs: tool.updates.length > 0 ? tool.updates : undefined,
    status: tool.status === "failed" ? "failed" : tool.status === "running" ? "running" : "succeeded",
  };
}

/**
 * Builds a tool group key for matching tool calls with results
 */
export function buildToolGroupKey(rawMessage: Record<string, unknown>, fallbackId: string): string {
  const toolCallId = typeof rawMessage.toolCallId === "string" ? rawMessage.toolCallId.trim() : "";
  if (toolCallId.length > 0) return toolCallId;

  const toolUseId = typeof rawMessage.toolUseId === "string" ? rawMessage.toolUseId.trim() : "";
  if (toolUseId.length > 0) return toolUseId;

  return fallbackId;
}
