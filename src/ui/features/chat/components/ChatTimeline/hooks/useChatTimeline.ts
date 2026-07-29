/**
 * Hook for building and managing chat timeline entries
 */

import { useMemo } from "react";
import type { ActivityTimelineEntry, IndexedMessage, TimelineEntry, ToolTimelineEntry } from "../../../types";
import type { SDKAssistantMessage, SDKToolResultMessage } from "../../../../../types";
import type { ReasoningStep, ToolExecution } from "../../../../../store/useAppStore";
import type { AgentDisplayStatus } from "../../../../../store/useAppStore";
import {
  normalizeReasoning,
  isGenericToolName,
  resolveToolName,
  formatToolText,
  isMeaningfulToolString,
  extractToolOutput,
  mergeToolEntryLogs,
  mergeToolEntryOutput,
  toolExecutionToTimelineEntry,
  buildToolGroupKey,
} from "../utils/groupMessages";
import { truncateInput } from "../../../../../utils/chat";

export type UseChatTimelineParams = {
  messages: IndexedMessage[];
  activeSessionId: string | null;
  partialReasoning?: string;
  reasoningSteps?: ReasoningStep[];
  showReasoning?: boolean;
  toolExecutions?: ToolExecution[];
  cliResults?: Array<{ id: string; command: string; output: string; exitCode: number }>;
  agentStatus?: AgentDisplayStatus;
};

/**
 * Hook that transforms messages and state into timeline entries
 */
export function useChatTimeline({
  messages,
  activeSessionId,
  partialReasoning = "",
  reasoningSteps = [],
  showReasoning = false,
  toolExecutions = [],
  cliResults = [],
  agentStatus = "idle",
}: UseChatTimelineParams): TimelineEntry[] {
  return useMemo(() => {
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

    // Merge current-turn reasoning and tools by their actual timestamps. The
    // previous implementation appended all reasoning first and all tools
    // second, which made the UI look stale and hid what the agent was doing.
    const liveEvents: Array<
      | { type: "reasoning"; at: number; id: string; content: string }
      | { type: "tool"; at: number; tool: ToolExecution }
    > = [];

    if (showReasoning) {
      reasoningSteps.forEach((step) => {
        if (step.content.trim()) {
          liveEvents.push({ type: "reasoning", at: step.updatedAt, id: step.id, content: step.content });
        }
      });
      if (partialReasoning.trim() && reasoningSteps.length === 0) {
        liveEvents.push({
          type: "reasoning",
          at: Number.MAX_SAFE_INTEGER,
          id: `${activeSessionId ?? "session"}-partial-reasoning`,
          content: partialReasoning,
        });
      }
    }

    toolExecutions.forEach((tool) => {
      liveEvents.push({ type: "tool", at: tool.startedAt, tool });
    });

    liveEvents.sort((a, b) => a.at - b.at).forEach((event) => {
      if (event.type === "reasoning") {
        const steps = normalizeReasoning(event.content);
        if (steps.length === 0) return;
        const existingIndex = entries.findIndex((entry) => entry?.kind === "reasoning" && entry.id === event.id);
        const nextEntry = { kind: "reasoning" as const, id: event.id, steps };
        if (existingIndex >= 0) entries[existingIndex] = nextEntry;
        else entries.push(nextEntry);
        return;
      }

      const ephemeralToolEntry = toolExecutionToTimelineEntry(event.tool);
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

    cliResults.forEach((result) => {
      entries.push({
        kind: "cli_result",
        id: result.id,
        command: result.command,
        output: result.output,
        exitCode: result.exitCode,
      });
    });

    const flat = entries.filter((entry): entry is TimelineEntry => entry !== null);

    const liveIds = new Set([
      ...reasoningSteps.map((step) => step.id),
      ...toolExecutions.map((tool) => tool.id),
      ...(partialReasoning.trim() ? [`${activeSessionId ?? "session"}-partial-reasoning`] : []),
    ]);
    const isAgentActive = agentStatus === "thinking" || agentStatus === "running_tool" || agentStatus === "waiting_approval" || agentStatus === "generating";
    return groupActivityRuns(flat, liveIds, isAgentActive);
  }, [messages, activeSessionId, partialReasoning, reasoningSteps, showReasoning, toolExecutions, cliResults, agentStatus]);
}

function groupActivityRuns(entries: TimelineEntry[], liveIds: Set<string>, isAgentActive: boolean): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  let activity: ActivityTimelineEntry[] = [];

  const flush = () => {
    if (activity.length === 0) return;
    const children = activity;
    activity = [];
    out.push({
      kind: "activity_group",
      id: `activity:${children[0].id}`,
      children,
      isLive: isAgentActive && children.some((entry) => liveIds.has(entry.id)),
    });
  };

  entries.forEach((entry) => {
    if (entry.kind === "reasoning" || entry.kind === "tool") {
      activity.push(entry);
      return;
    }
    flush();
    out.push(entry);
  });
  flush();
  return out;
}
