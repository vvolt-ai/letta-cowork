import { useMemo } from "react";
import type { IndexedMessage } from "../../hooks/useMessageWindow";
import type { StreamMessage, SDKAssistantMessage, SDKToolResultMessage } from "../../types";
import type { ReasoningStep, ToolExecution } from "../../store/useAppStore";
import { truncateInput } from "../../utils/chat";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolExecutionBlock } from "./ToolBlocks";

interface ChatTimelineProps {
  messages: IndexedMessage[];
  activeSessionId: string | null;
  agentName: string;
  partialMessage: string;
  showPartialMessage: boolean;
  partialReasoning?: string;
  reasoningSteps?: ReasoningStep[];
  toolExecutions?: ToolExecution[];
  showReasoning?: boolean;
  errorMessage?: string;
}

export type TimelineEntry =
  | { kind: "user"; id: string; message: StreamMessage }
  | { kind: "assistant"; id: string; message?: SDKAssistantMessage; text?: string; streaming?: boolean }
  | { kind: "reasoning"; id: string; steps: string[] }
  | {
      kind: "tool";
      id: string;
      name: string;
      input?: string | null;
      output?: string | null;
      logs?: string[];
      status: "running" | "succeeded" | "failed";
    };

type ToolTimelineEntry = Extract<TimelineEntry, { kind: "tool" }>;

function normalizeReasoning(content: unknown): string[] {
  if (!content) return [];
  const asString = typeof content === "string" ? content : String(content ?? "");
  return asString
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isMeaningfulToolString(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed === "?" || trimmed === "??") return false;
  if (/^[\s"'`]*[\]\[\{\}()]+[\s"'`]*$/.test(trimmed)) return false;
  const stripped = trimmed.replace(/["'`]/g, "");
  if (!stripped) return false;
  const meaningless = new Set(["{}", "[]", "{", "}", "[", "]", "()"]);
  if (meaningless.has(stripped)) return false;
  return true;
}

function stringifyObjectValue(value: Record<string, unknown>): string | undefined {
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

function formatToolText(value: unknown): string | undefined {
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

function collectLogEntries(source: unknown, label?: string): string[] {
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

function isGenericToolName(name: string | undefined | null): boolean {
  if (!name) return true;
  const normalized = name.trim().toLowerCase();
  return normalized.length === 0 || normalized === "tool" || normalized === "?";
}

function resolveToolName(rawName: unknown, fallback?: string): string {
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

function extractToolOutput(message: SDKToolResultMessage & { [key: string]: unknown }): {
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

function mergeToolEntryLogs(existing?: string[], incoming?: string[]): string[] | undefined {
  const merged = Array.from(new Set([...(existing ?? []), ...(incoming ?? [])]));
  return merged.length > 0 ? merged : undefined;
}

function mergeToolEntryOutput(existing?: string | null, incoming?: string | null): string | undefined {
  const nextIncoming = incoming?.trim();
  const nextExisting = existing?.trim();

  if (!nextIncoming) return nextExisting || undefined;
  if (!nextExisting) return nextIncoming;

  if (nextExisting === nextIncoming) return nextExisting;
  if (nextExisting.includes(nextIncoming)) return nextExisting;
  if (nextIncoming.includes(nextExisting)) return nextIncoming;

  return `${nextExisting}\n${nextIncoming}`;
}

function toolExecutionToTimelineEntry(tool: ToolExecution): ToolTimelineEntry {
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

function buildToolGroupKey(rawMessage: Record<string, unknown>, fallbackId: string): string {
  const toolCallId = typeof rawMessage.toolCallId === "string" ? rawMessage.toolCallId.trim() : "";
  if (toolCallId.length > 0) return toolCallId;

  const toolUseId = typeof rawMessage.toolUseId === "string" ? rawMessage.toolUseId.trim() : "";
  if (toolUseId.length > 0) return toolUseId;

  return fallbackId;
}

export function ChatTimeline({
  messages,
  activeSessionId,
  agentName,
  partialMessage,
  showPartialMessage,
  partialReasoning = "",
  reasoningSteps = [],
  toolExecutions = [],
  showReasoning = false,
  errorMessage,
}: ChatTimelineProps) {
  const timeline = useMemo(() => {
    const entries: Array<TimelineEntry | null> = [];
    const reasoningIndex = new Map<string, number>();
    const toolIndexById = new Map<string, number>();

    const upsertToolEntry = (entry: ToolTimelineEntry) => {
      const existingIndex = toolIndexById.get(entry.id);
      if (existingIndex !== undefined) {
        const existing = entries[existingIndex];
        if (existing && existing.kind === "tool") {
          const mergedOutput = mergeToolEntryOutput(existing.output, entry.output);
          const mergedLogs = mergeToolEntryLogs(existing.logs, entry.logs);
          entries[existingIndex] = {
            ...existing,
            ...entry,
            name: isGenericToolName(entry.name) ? existing.name : entry.name,
            input: entry.input ?? existing.input,
            output: mergedOutput,
            logs: mergedLogs,
          };
          return;
        }
      }

      const nextIndex = entries.length;
      entries.push(entry);
      toolIndexById.set(entry.id, nextIndex);
    };

    messages.forEach((item) => {
      const message = item.message;
      const baseId = (message as any).uuid || (message as any).id || `${activeSessionId ?? "session"}-msg-${item.originalIndex}`;

      switch (message.type) {
        case "user_prompt": {
          entries.push({ kind: "user", id: baseId, message });
          break;
        }
        case "assistant": {
          entries.push({ kind: "assistant", id: baseId, message: message as SDKAssistantMessage });
          break;
        }
        case "reasoning": {
          if (!showReasoning) {
            break;
          }
          const reasoningId = baseId;
          const steps = normalizeReasoning((message as any).content ?? (message as any).text ?? "");
          if (steps.length === 0) {
            break;
          }
          const existingIndex = reasoningIndex.get(reasoningId);
          if (existingIndex !== undefined) {
            entries[existingIndex] = { kind: "reasoning", id: reasoningId, steps };
          } else {
            reasoningIndex.set(reasoningId, entries.length);
            entries.push({ kind: "reasoning", id: reasoningId, steps });
          }
          break;
        }
        case "tool_call": {
          const rawMessage = message as any;
          const toolId = buildToolGroupKey(rawMessage, rawMessage.toolCallId ?? baseId);
          const rawName = rawMessage.toolName ?? rawMessage.name ?? rawMessage.displayName;
          const name = resolveToolName(rawName, "Tool");
          if (name === "tool_return_message" || name === "approval_response_message" || name === "approval_request_message") {
            break;
          }
          const rawInput = rawMessage.rawArguments ?? rawMessage.toolInput ?? rawMessage.input ?? rawMessage.arguments ?? rawMessage.params ?? undefined;
           if (isGenericToolName(typeof rawName === "string" ? rawName : undefined) && !formatToolText(rawInput)) {
            break;
          }
          const formattedInput = formatToolText(rawInput);
          const truncatedInput = typeof rawInput === "string" ? truncateInput(rawInput) : undefined;
          const displayInput = formattedInput ?? (truncatedInput && isMeaningfulToolString(truncatedInput) ? truncatedInput : undefined);
          const entry: ToolTimelineEntry = {
            kind: "tool",
            id: toolId,
            name,
            input: displayInput,
            status: "running",
          };
          upsertToolEntry(entry);
          break;
        }
        case "tool_result": {
          const rawMessage = message as SDKToolResultMessage & { [key: string]: unknown };
          const toolId = buildToolGroupKey(rawMessage as Record<string, unknown>, (rawMessage as any).toolCallId ?? baseId);
          const name = resolveToolName(
            (rawMessage as any).toolName ?? (rawMessage as any).name ?? (rawMessage as any).displayName,
            "Tool"
          );
          if (name === "tool_return_message" || name === "approval_response_message" || name === "approval_request_message") {
            break;
          }
          const { output, logs } = extractToolOutput(rawMessage);
          const rawToolInput = (rawMessage as any).toolInput ?? (rawMessage as any).input;
          const formattedToolInput = formatToolText(rawToolInput);
          const truncatedToolInput = typeof rawToolInput === "string" ? truncateInput(rawToolInput) : undefined;
          const displayInput = formattedToolInput ?? (truncatedToolInput && isMeaningfulToolString(truncatedToolInput) ? truncatedToolInput : undefined);
          const entry: ToolTimelineEntry = {
            kind: "tool",
            id: toolId,
            name,
            input: displayInput,
            output,
            logs,
            status: rawMessage.isError ? "failed" : "succeeded",
          };
          upsertToolEntry(entry);
          break;
        }
        case "result": {
          break;
        }
        default: {
          break;
        }
      }
    });

    if (showReasoning) {
      const combinedReasoning = [
        ...reasoningSteps
          .map((step) => step.content)
          .filter((content) => typeof content === "string" && content.trim().length > 0),
        partialReasoning.trim(),
      ]
        .filter((content) => content.length > 0)
        .join("\n");
      const normalizedSteps = normalizeReasoning(combinedReasoning);
      if (normalizedSteps.length > 0) {
        entries.push({
          kind: "reasoning",
          id: `${activeSessionId ?? "session"}-ephemeral-reasoning`,
          steps: normalizedSteps,
        });
      }
    }

    toolExecutions.forEach((toolExecution) => {
      const ephemeralToolEntry = toolExecutionToTimelineEntry(toolExecution);
      const existingIndex = entries.findIndex((entry) => entry?.kind === "tool" && entry.id === ephemeralToolEntry.id);
      if (existingIndex >= 0) {
        const existing = entries[existingIndex];
        if (existing && existing.kind === "tool") {
          entries[existingIndex] = {
            ...existing,
            ...ephemeralToolEntry,
            name: isGenericToolName(ephemeralToolEntry.name) ? existing.name : ephemeralToolEntry.name,
            input: ephemeralToolEntry.input ?? existing.input,
            output: mergeToolEntryOutput(existing.output, ephemeralToolEntry.output),
            logs: mergeToolEntryLogs(existing.logs, ephemeralToolEntry.logs),
          };
        }
      } else {
        entries.push(ephemeralToolEntry);
      }
    });

    return entries.filter((entry): entry is TimelineEntry => entry !== null);
  }, [messages, activeSessionId, partialReasoning, reasoningSteps, showReasoning, toolExecutions]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {timeline.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          Start a conversation to see reasoning, tool activity, and results here.
        </div>
      ) : (
        timeline.map((entry) => {
          switch (entry.kind) {
            case "user":
              return <UserMessage key={entry.id} message={entry.message as any} />;
            case "assistant":
              return (
                <AssistantMessage
                  key={entry.id}
                  message={entry.message}
                  fallbackText={entry.text}
                  agentName={agentName}
                  isStreaming={entry.streaming}
                />
              );
            case "reasoning":
              return <ReasoningBlock key={entry.id} steps={entry.steps} />;
            case "tool":
              return (
                <ToolExecutionBlock
                  key={entry.id}
                  name={entry.name}
                  status={entry.status}
                  input={entry.input}
                  output={entry.output}
                  logs={entry.logs}
                />
              );
            default:
              return null;
          }
        })
      )}

      {showPartialMessage ? (
        <AssistantMessage
          key="assistant-partial"
          fallbackText={partialMessage}
          agentName={agentName}
          isStreaming
        />
      ) : null}

      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-status-error)]/25 bg-[var(--color-status-error)]/5 px-4 py-3 text-sm">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-status-error)]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div>
            <div className="font-medium text-[var(--color-status-error)]">Agent error</div>
            <div className="mt-0.5 text-xs leading-5 text-[var(--color-status-error)]/80">{errorMessage}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
