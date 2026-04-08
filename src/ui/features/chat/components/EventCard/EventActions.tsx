/**
 * EventActions - Action button components for tool calls
 */

import { useEffect } from "react";
import type { SDKToolCallMessage, CanUseToolResponse } from "../../../../types";
import type { PermissionRequest } from "../../../../store/useAppStore";
import { StatusDot } from "./EventHeader";
import {
  useToolStatus,
  getAskUserQuestionSignature,
  initToolStatus,
} from "./hooks/useEventCard";
import type { StatusDotVariant } from "./EventHeader";
import {
  getToolStatusVariant,
  isToolPending,
  shouldShowToolDot,
} from "./EventHeader";
import type { AskUserQuestionInput } from "../../types";

// ============================================================================
// Tool Call Card
// ============================================================================

export interface ToolCallCardProps {
  message: SDKToolCallMessage;
  showIndicator?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: CanUseToolResponse) => void;
}

export const ToolCallCard = ({
  message,
  showIndicator = false,
  permissionRequest,
  onPermissionResult,
}: ToolCallCardProps) => {
  const toolStatus = useToolStatus(message.toolCallId);
  const statusVariant: StatusDotVariant = getToolStatusVariant(toolStatus);
  const isPending = isToolPending(toolStatus);
  const shouldShowDot = shouldShowToolDot(toolStatus, showIndicator);

  useEffect(() => {
    initToolStatus(message.toolCallId);
  }, [message.toolCallId]);

  const getToolInfo = (): string | null => {
    const input = message.toolInput;
    switch (message.toolName) {
      case "Bash":
        return (input as Record<string, unknown>)?.command as string | null;
      case "Read":
      case "Write":
      case "Edit":
        return (input as Record<string, unknown>)?.file_path as string | null;
      case "Glob":
      case "Grep":
        return (input as Record<string, unknown>)?.pattern as string | null;
      case "Task":
        return (input as Record<string, unknown>)?.description as string | null;
      case "WebFetch":
        return (input as Record<string, unknown>)?.url as string | null;
      default:
        return null;
    }
  };

  // Handle AskUserQuestion specially
  if (message.toolName === "AskUserQuestion") {
    const input = message.toolInput as AskUserQuestionInput | null;
    const questions = input?.questions ?? [];
    const currentSignature = getAskUserQuestionSignature(input);
    const requestSignature = getAskUserQuestionSignature(
      permissionRequest?.input as AskUserQuestionInput | undefined
    );
    const isActiveRequest =
      permissionRequest && currentSignature === requestSignature;

    if (isActiveRequest && onPermissionResult) {
      // Dynamic import to avoid circular dependency
      const { DecisionPanel } = require("../../../../DecisionPanel");
      return (
        <div className="mt-4">
          <DecisionPanel
            request={permissionRequest}
            onSubmit={(result: CanUseToolResponse) =>
              onPermissionResult(permissionRequest.toolUseId, result)
            }
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4">
        <div className="flex flex-row items-center gap-2">
          <StatusDot variant="success" isActive={false} isVisible={true} />
          <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium">
            AskUserQuestion
          </span>
        </div>
        {questions.map((q, idx) => (
          <div key={idx} className="text-sm text-ink-700 ml-4">
            {q.question}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4 overflow-hidden">
      <div className="flex flex-row items-center gap-2 min-w-0">
        <StatusDot
          variant={statusVariant}
          isActive={isPending && showIndicator}
          isVisible={shouldShowDot}
        />
        <div className="flex flex-row items-center gap-2 tool-use-item min-w-0 flex-1">
          <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium shrink-0">
            {message.toolName}
          </span>
          <span className="text-sm text-muted truncate">{getToolInfo()}</span>
        </div>
      </div>
    </div>
  );
};
