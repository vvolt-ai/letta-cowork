import { useEffect, useState } from "react";
import type { ToolStatus, AskUserQuestionInput } from "../../../types";

// Global tool status tracking
const toolStatusMap = new Map<string, ToolStatus>();
const toolStatusListeners = new Set<() => void>();

/**
 * Set the status of a tool call
 */
export const setToolStatus = (toolCallId: string | undefined, status: ToolStatus) => {
  if (!toolCallId) return;
  toolStatusMap.set(toolCallId, status);
  toolStatusListeners.forEach((listener) => listener());
};

/**
 * Hook to subscribe to tool status changes
 */
export const useToolStatus = (toolCallId: string | undefined) => {
  const [status, setStatus] = useState<ToolStatus | undefined>(() =>
    toolCallId ? toolStatusMap.get(toolCallId) : undefined
  );

  useEffect(() => {
    if (!toolCallId) return;
    const handleUpdate = () => setStatus(toolStatusMap.get(toolCallId));
    toolStatusListeners.add(handleUpdate);
    return () => {
      toolStatusListeners.delete(handleUpdate);
    };
  }, [toolCallId]);

  return status;
};

/**
 * Get a signature for AskUserQuestion input to compare requests
 */
export const getAskUserQuestionSignature = (input?: AskUserQuestionInput | null) => {
  if (!input?.questions?.length) return "";
  return input.questions
    .map((question) => {
      const options = (question.options ?? [])
        .map((o) => `${o.label}|${o.description ?? ""}`)
        .join(",");
      return `${question.question}|${question.header ?? ""}|${question.multiSelect ? "1" : "0"}|${options}`;
    })
    .join("||");
};

/**
 * Check if a tool call ID has a pending status
 */
export const hasToolStatus = (toolCallId: string | undefined): boolean => {
  if (!toolCallId) return false;
  return toolStatusMap.has(toolCallId);
};

/**
 * Initialize tool status as pending if not already set
 */
export const initToolStatus = (toolCallId: string | undefined) => {
  if (toolCallId && !toolStatusMap.has(toolCallId)) {
    setToolStatus(toolCallId, "pending");
  }
};
