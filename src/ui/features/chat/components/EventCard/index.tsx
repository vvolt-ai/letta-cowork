/**
 * EventCard (MessageCard) - Main card component for displaying messages
 *
 * This is the main entry point for the EventCard component.
 * It re-exports MessageCard as EventCard for backward compatibility.
 */

import { useState } from "react";
import type { StreamMessage, SDKMessage, CanUseToolResponse } from "../../../../types";
import type { PermissionRequest } from "../../../../store/useAppStore";
import { BackgroundHeader, getBackgroundLabel } from "./EventHeader";
import { ToolResultCard, AssistantCard, ReasoningCard } from "./EventContent";
import { ToolCallCard } from "./EventActions";
import { InitCard, UserPromptCard } from "./EventMeta";
import type { UserPromptCardMessage } from "../../types";

// ============================================================================
// Message Card Component
// ============================================================================

export interface MessageCardProps {
  message: StreamMessage;
  isLast?: boolean;
  isRunning?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: CanUseToolResponse) => void;
  agentName?: string;
}

export function MessageCard({
  message,
  isLast = false,
  isRunning = false,
  permissionRequest,
  onPermissionResult,
  agentName,
}: MessageCardProps) {
  const showIndicator = isLast && isRunning;

  // State to track if this specific background message is expanded
  const [isExpanded, setIsExpanded] = useState(false);

  // User prompt (local type, not from SDK)
  if (message.type === "user_prompt") {
    return <UserPromptCard message={message as UserPromptCardMessage} showIndicator={showIndicator} />;
  }

  // SDK message types
  const sdkMessage = message as SDKMessage;

  // Check if this is a background message type
  const isBackgroundMessage = ["init", "reasoning", "tool_call", "tool_result"].includes(sdkMessage.type);

  // Render background messages with blur/collapse
  if (isBackgroundMessage) {
    // Get the inner content
    let content: React.ReactNode = null;
    switch (sdkMessage.type) {
      case "init":
        content = <InitCard message={sdkMessage} showIndicator={showIndicator} />;
        break;
      case "reasoning":
        content = <ReasoningCard message={sdkMessage} showIndicator={showIndicator} />;
        break;
      case "tool_call":
        content = (
          <ToolCallCard
            message={sdkMessage}
            showIndicator={showIndicator}
            permissionRequest={permissionRequest}
            onPermissionResult={onPermissionResult}
          />
        );
        break;
      case "tool_result":
        content = <ToolResultCard message={sdkMessage} />;
        break;
    }

    if (!isExpanded) {
      // Collapsed state - show small indicator
      return (
        <div
          className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors border border-gray-700/50"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(true);
          }}
        >
          <span className="text-gray-400 text-sm">▸</span>
          <span className="text-gray-500 text-sm">{getBackgroundLabel(sdkMessage.type)}</span>
          <span className="text-gray-600 text-xs">(click to show)</span>
        </div>
      );
    }

    // Expanded state - show content with option to collapse
    return (
      <div className="mt-2">
        <BackgroundHeader
          type={sdkMessage.type}
          isExpanded={isExpanded}
          onClick={() => setIsExpanded(false)}
        />
        <div className="bg-gray-900/30 rounded-b-lg border border-gray-700/50 border-t-0 p-2">
          {content}
        </div>
      </div>
    );
  }

  // Non-background messages
  switch (sdkMessage.type) {
    case "init":
      return <InitCard message={sdkMessage} showIndicator={showIndicator} />;

    case "assistant":
      return (
        <AssistantCard
          message={sdkMessage}
          showIndicator={showIndicator}
          agentName={agentName}
        />
      );

    case "reasoning":
      return <ReasoningCard message={sdkMessage} showIndicator={showIndicator} />;

    case "tool_call":
      return (
        <ToolCallCard
          message={sdkMessage}
          showIndicator={showIndicator}
          permissionRequest={permissionRequest}
          onPermissionResult={onPermissionResult}
        />
      );

    case "tool_result":
      return <ToolResultCard message={sdkMessage} />;

    case "result":
      // Don't render session result
      if (sdkMessage.success) {
        return null;
      }
      // Only show errors
      return (
        <div className="flex flex-col gap-2 mt-4">
          <div className="header text-error">Error</div>
          <div className="rounded-xl bg-error-light p-3">
            <pre className="text-sm text-error whitespace-pre-wrap">
              {sdkMessage.error || "Unknown error"}
            </pre>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ============================================================================
// Backward Compatibility Export
// ============================================================================

// Export MessageCard as EventCard for backward compatibility
export { MessageCard as EventCard };

// Re-export types for backward compatibility
export { isMarkdown, extractTagContent } from "./EventContent";
export { formatBytes } from "./EventMeta";
export type { UserPromptCardMessage } from "../../types";

// Re-export hook functions for backward compatibility
export { setToolStatus, useToolStatus } from "./hooks/useEventCard";
