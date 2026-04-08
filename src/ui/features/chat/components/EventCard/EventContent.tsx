/**
 * EventContent - Content display components for different message types
 */

import { useEffect, useRef, useState } from "react";
import type { SDKToolResultMessage, SDKAssistantMessage, SDKReasoningMessage } from "../../../../types";
import { HeaderLabel, StatusDot } from "./EventHeader";
import { setToolStatus } from "./hooks/useEventCard";

// ============================================================================
// Utility Functions
// ============================================================================

const MAX_VISIBLE_LINES = 3;

export function isMarkdown(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const patterns: RegExp[] = [/^#{1,6}\s+/m, /```[\s\S]*?```/];
  return patterns.some((pattern) => pattern.test(text));
}

export function extractTagContent(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
}

// ============================================================================
// Tool Result Card
// ============================================================================

export interface ToolResultCardProps {
  message: SDKToolResultMessage;
}

export const ToolResultCard = ({ message }: ToolResultCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);

  const isError = message.isError;
  let lines: string[];

  if (isError) {
    lines = [extractTagContent(message.content, "tool_use_error") || message.content];
  } else {
    lines = message.content.split("\n");
  }

  const isMarkdownContent = isMarkdown(lines.join("\n"));
  const hasMoreLines = lines.length > MAX_VISIBLE_LINES;
  const visibleContent =
    hasMoreLines && !isExpanded
      ? lines.slice(0, MAX_VISIBLE_LINES).join("\n")
      : lines.join("\n");

  useEffect(() => {
    setToolStatus(message.toolCallId, isError ? "error" : "success");
  }, [message.toolCallId, isError]);

  useEffect(() => {
    if (!hasMoreLines || isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hasMoreLines, isExpanded]);

  // Dynamic import to avoid circular dependency
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent">Output</div>
      <div className="mt-2 rounded-xl bg-surface-tertiary p-3">
        <pre
          className={`text-sm whitespace-pre-wrap break-words font-mono ${isError ? "text-red-500" : "text-ink-700"}`}
        >
          {isMarkdownContent ? <MDContent text={visibleContent} /> : visibleContent}
        </pre>
        {hasMoreLines && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            <span>{isExpanded ? "▲" : "▼"}</span>
            <span>
              {isExpanded ? "Collapse" : `Show ${lines.length - MAX_VISIBLE_LINES} more lines`}
            </span>
          </button>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// ============================================================================
// Assistant Card
// ============================================================================

export interface AssistantCardProps {
  message: SDKAssistantMessage;
  showIndicator?: boolean;
  agentName?: string;
}

export const AssistantCard = ({
  message,
  showIndicator = false,
  agentName,
}: AssistantCardProps) => {
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        {agentName || "Assistant"}
      </div>
      <MDContent text={message.content} />
    </div>
  );
};

// ============================================================================
// Reasoning Card
// ============================================================================

export interface ReasoningCardProps {
  message: SDKReasoningMessage;
  showIndicator?: boolean;
}

export const ReasoningCard = ({ message, showIndicator = false }: ReasoningCardProps) => {
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <HeaderLabel
        label="Thinking"
        variant="success"
        isActive={showIndicator}
        showIndicator={showIndicator}
      />
      <MDContent text={message.content} />
    </div>
  );
};
