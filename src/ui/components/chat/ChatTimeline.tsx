import { useMemo } from "react";
import type { IndexedMessage } from "../../hooks/useMessageWindow";
import type { StreamMessage, SDKAssistantMessage, SDKToolResultMessage } from "../../types";
import type { ReasoningStep } from "../../store/useAppStore";
import { truncateInput } from "../../utils/chat";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ReasoningBlock } from "./ReasoningBlock";
import { ToolCallBlock, ToolResultBlock } from "./ToolBlocks";

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
  | { kind: "tool_call"; id: string; name: string; input?: string | null }
  | { kind: "tool_result"; id: string; name: string; output?: string | null; logs?: string[]; isError?: boolean };

function normalizeReasoning(content: unknown): string[] {
  if (!content) return [];
  const asString = typeof content === "string" ? content : String(content ?? "");
  return asString
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractToolOutput(message: SDKToolResultMessage & { [key: string]: unknown }): {
  output?: string | null;
  logs?: string[];
} {
  const rawOutput = message.output ?? message.result ?? message.content ?? null;
  let output: string | null = null;

  if (typeof rawOutput === "string") {
    output = rawOutput;
  } else if (rawOutput) {
    try {
      output = JSON.stringify(rawOutput, null, 2);
    } catch {
      output = String(rawOutput);
    }
  }

  const logs = Array.isArray(message.logs)
    ? message.logs.map((log) => (typeof log === "string" ? log : JSON.stringify(log)))
    : [];

  return { output, logs };
}

export function ChatTimeline({ messages, activeSessionId, agentName, partialMessage, showPartialMessage, reasoningSteps = [] }: ChatTimelineProps) {
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];
    const reasoningIndex = new Map<string, number>();

    messages.forEach((item, index) => {
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
          const name = rawMessage.toolName ?? "Tool";
          const input = truncateInput(rawMessage.toolInput ?? rawMessage.input ?? rawMessage.arguments ?? "");
          if (name === "tool_return_message" || name === "approval_response_message" || name === "approval_request_message") {
            break;
          }
          entries.push({ kind: "tool_call", id: toolId, name, input });
          break;
        }
        case "tool_result": {
          const rawMessage = message as SDKToolResultMessage & { [key: string]: unknown };
          const toolId = (rawMessage as any).toolCallId ?? baseId;
          const name = (rawMessage as any).toolName ?? "Tool";
          if (name === "tool_return_message" || name === "approval_response_message" || name === "approval_request_message") {
            break;
          }
          const { output, logs } = extractToolOutput(rawMessage);
          const inputFallback = truncateInput((rawMessage as any).toolInput ?? (rawMessage as any).input ?? "");
          entries.push({
            kind: "tool_result",
            id: `${toolId}-result-${index}`,
            name,
            output: output ?? inputFallback,
            logs,
            isError: Boolean(rawMessage.isError),
          });
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

    return entries;
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
            case "tool_call":
              return <ToolCallBlock key={entry.id} name={entry.name} input={entry.input} />;
            case "tool_result":
              return (
                <ToolResultBlock
                  key={entry.id}
                  name={entry.name}
                  output={entry.output}
                  logs={entry.logs}
                  isError={entry.isError}
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
