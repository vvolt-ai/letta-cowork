import { useMemo } from "react";
import type { IndexedMessage } from "../../hooks/useMessageWindow";
import type { StreamMessage, SDKAssistantMessage, SDKToolResultMessage } from "../../types";
import type { ReasoningStep } from "../../store/useAppStore";
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
  reasoningSteps?: ReasoningStep[];
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

  const pieces: string[] = [];
  for (const key of keys) {
    const candidateValue = value[key];
    const formatted = formatToolText(candidateValue);
    if (formatted) {
      pieces.push(`${key}: ${formatted}`);
    }
  }

  if (pieces.length === 0) {
    try {
      const serialized = JSON.stringify(value, null, 2);
      const trimmedSerialized = serialized.trim();
      return isMeaningfulToolString(trimmedSerialized) ? trimmedSerialized : undefined;
    } catch {
      return undefined;
    }
  }

  return pieces.join("\n");
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

export function ChatTimeline({ messages, activeSessionId, agentName, partialMessage, showPartialMessage, reasoningSteps = [] }: ChatTimelineProps) {
  const timeline = useMemo(() => {
    const entries: Array<TimelineEntry | null> = [];
    const reasoningIndex = new Map<string, number>();
    let latestToolIndex: number | null = null;
    let latestToolId: string | null = null;

    const removeToolEntry = () => {
      if (latestToolIndex !== null) {
        entries[latestToolIndex] = null;
      }
      latestToolIndex = null;
      latestToolId = null;
    };

    const pushToolEntry = (entry: TimelineEntry) => {
      removeToolEntry();
      latestToolIndex = entries.length;
      latestToolId = entry.id;
      entries.push(entry);
    };

    const upsertToolEntry = (entry: TimelineEntry) => {
      if (latestToolIndex !== null && latestToolId === entry.id) {
        const existing = entries[latestToolIndex];
        if (existing?.kind === "tool") {
          const existingOutput = existing.output ?? "";
          const incomingOutput = entry.output ?? "";
          const mergedOutput = incomingOutput
            ? existingOutput
              ? existingOutput.includes(incomingOutput)
                ? existingOutput
                : `${existingOutput}
${incomingOutput}`
              : incomingOutput
            : existingOutput || undefined;

          const existingLogs = existing.logs ?? [];
          const incomingLogs = entry.logs ?? [];
          const mergedLogs = incomingLogs.length > 0
            ? Array.from(new Set([...existingLogs, ...incomingLogs]))
            : existingLogs;

          entries[latestToolIndex] = {
            ...existing,
            ...entry,
            input: existing.input ?? entry.input,
            logs: mergedLogs.length > 0 ? mergedLogs : undefined,
            output: mergedOutput,
            status: entry.status,
          };
          latestToolId = entry.id;
          return;
        }
      }
      pushToolEntry(entry);
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
          removeToolEntry();
          entries.push({ kind: "assistant", id: baseId, message: message as SDKAssistantMessage });
          break;
        }
        case "reasoning": {
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
          const toolId = rawMessage.toolCallId ?? baseId;
          const name = resolveToolName(rawMessage.toolName ?? rawMessage.name ?? rawMessage.displayName, "Tool");
          if (name === "tool_return_message" || name === "approval_response_message" || name === "approval_request_message") {
            break;
          }
          const rawInput = rawMessage.toolInput ?? rawMessage.input ?? rawMessage.arguments ?? rawMessage.params ?? undefined;
          const formattedInput = formatToolText(rawInput);
          const truncatedInput = typeof rawInput === "string" ? truncateInput(rawInput) : undefined;
          const displayInput = formattedInput ?? (truncatedInput && isMeaningfulToolString(truncatedInput) ? truncatedInput : undefined);
          const entry: TimelineEntry = {
            kind: "tool",
            id: toolId,
            name,
            input: displayInput,
            status: "running",
          };
          pushToolEntry(entry);
          break;
        }
        case "tool_result": {
          const rawMessage = message as SDKToolResultMessage & { [key: string]: unknown };
          const toolId = (rawMessage as any).toolCallId ?? baseId;
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
          const entry: TimelineEntry = {
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
          removeToolEntry();
          break;
        }
        default: {
          break;
        }
      }
    });

    if (reasoningSteps.length > 0) {
      const combinedReasoning = reasoningSteps
        .map((step) => step.content)
        .filter((content) => typeof content === "string" && content.trim().length > 0)
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

    return entries.filter((entry): entry is TimelineEntry => entry !== null);
  }, [messages, activeSessionId, reasoningSteps]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
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
    </div>
  );
}
