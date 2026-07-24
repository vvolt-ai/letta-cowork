/**
 * Hook for building and managing chat timeline entries
 */

import { useMemo } from "react";
import type { IndexedMessage, TimelineEntry, ToolTimelineEntry } from "../../../types";
import type { SDKAssistantMessage, SDKToolResultMessage } from "../../../../../types";
import type { ReasoningStep, ToolExecution } from "../../../../../store/useAppStore";
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

    // Post-process: collapse runs of adjacent tool entries into a single
    // tool_activity row. Tool details are useful when debugging, but inline
    // JSON/tool churn makes normal answer review painful.
    return collapseConsecutiveToolRuns(flat);
  }, [messages, activeSessionId, partialReasoning, reasoningSteps, showReasoning, toolExecutions, cliResults]);
}

/**
 * Walks the flat timeline and folds runs of >=2 adjacent `tool` entries
 * into a `tool_group` entry. Any non-tool entry (assistant, reasoning,
 * user, cli_result) breaks the run.
 *
 * Pure function, exported for unit testing.
 */
function collapseConsecutiveToolRuns(entries: TimelineEntry[]): TimelineEntry[] {
  const GROUP_THRESHOLD = 2;
  const out: TimelineEntry[] = [];
  let i = 0;
  while (i < entries.length) {
    const current = entries[i];
    if (current.kind !== "tool") {
      out.push(current);
      i += 1;
      continue;
    }

    const run: ToolTimelineEntry[] = [current];
    let j = i + 1;
    while (j < entries.length) {
      const next = entries[j];
      if (next.kind !== "tool") break;
      run.push(next);
      j += 1;
    }

    if (run.length >= GROUP_THRESHOLD) {
      const uniqueNames = Array.from(new Set(run.map((entry) => entry.name)));
      out.push({
        kind: "tool_group",
        id: `tool-group:${run[0].id}`,
        name: uniqueNames.length === 1 ? uniqueNames[0] : "Tool activity",
        children: run,
      });
    } else {
      out.push(current);
    }
    i = j;
  }
  return out;
}
