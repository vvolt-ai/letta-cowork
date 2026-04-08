/**
 * EventHeader - Card header components with status indicators
 */

import type { ToolStatus } from "../../types";

// ============================================================================
// Status Dot Component
// ============================================================================

export type StatusDotVariant = "accent" | "success" | "error";

export interface StatusDotProps {
  variant?: StatusDotVariant;
  isActive?: boolean;
  isVisible?: boolean;
}

export const StatusDot = ({
  variant = "accent",
  isActive = false,
  isVisible = true,
}: StatusDotProps) => {
  if (!isVisible) return null;

  const colorClass =
    variant === "success"
      ? "bg-success"
      : variant === "error"
        ? "bg-error"
        : "bg-accent";

  return (
    <span className="relative flex h-2 w-2">
      {isActive && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-75`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
    </span>
  );
};

// ============================================================================
// Header Label Component
// ============================================================================

export interface HeaderLabelProps {
  label: string;
  variant?: StatusDotVariant;
  isActive?: boolean;
  showIndicator?: boolean;
}

export const HeaderLabel = ({
  label,
  variant = "success",
  isActive = false,
  showIndicator = false,
}: HeaderLabelProps) => (
  <div className="header text-accent flex items-center gap-2">
    <StatusDot variant={variant} isActive={isActive} isVisible={showIndicator} />
    {label}
  </div>
);

// ============================================================================
// Background Message Header
// ============================================================================

export interface BackgroundHeaderProps {
  type: string;
  isExpanded: boolean;
  onClick: () => void;
}

export const getBackgroundLabel = (type: string): string => {
  switch (type) {
    case "init":
      return "Initialization";
    case "reasoning":
      return "Thinking";
    case "tool_call":
      return "Tool Running";
    case "tool_result":
      return "Tool Result";
    default:
      return "Background";
  }
};

export const BackgroundHeader = ({
  type,
  isExpanded,
  onClick,
}: BackgroundHeaderProps) => {
  if (!isExpanded) {
    return (
      <div
        className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors border border-gray-700/50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
      >
        <span className="text-gray-400 text-sm">▸</span>
        <span className="text-gray-500 text-sm">{getBackgroundLabel(type)}</span>
        <span className="text-gray-600 text-xs">(click to show)</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-t-lg cursor-pointer hover:bg-gray-700/50 transition-colors border border-gray-700/50 border-b-0"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      <span className="text-gray-400 text-sm">▾</span>
      <span className="text-gray-500 text-sm">{getBackgroundLabel(type)}</span>
      <span className="text-gray-600 text-xs">(click to hide)</span>
    </div>
  );
};

// ============================================================================
// Tool Status Helpers
// ============================================================================

export const getToolStatusVariant = (toolStatus: ToolStatus | undefined): StatusDotVariant => {
  return toolStatus === "error" ? "error" : "success";
};

export const isToolPending = (toolStatus: ToolStatus | undefined): boolean => {
  return !toolStatus || toolStatus === "pending";
};

export const shouldShowToolDot = (
  toolStatus: ToolStatus | undefined,
  showIndicator: boolean
): boolean => {
  return toolStatus === "success" || toolStatus === "error" || showIndicator;
};
