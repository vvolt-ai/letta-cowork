/**
 * EventMeta - Metadata display components (Init, UserPrompt)
 */

import { HeaderLabel, StatusDot } from "./EventHeader";
import type { SDKInitMessage } from "../../../../types";
import type { UserPromptCardMessage } from "../../types";

// ============================================================================
// Utility Functions
// ============================================================================

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

// ============================================================================
// Init Card
// ============================================================================

export interface InitCardProps {
  message: SDKInitMessage;
  showIndicator?: boolean;
}

const InfoItem = ({ name, value }: { name: string; value: string }) => (
  <div className="text-[14px]">
    <span className="mr-4 font-normal">{name}</span>
    <span className="font-light">{value}</span>
  </div>
);

export const InitCard = ({ message, showIndicator = false }: InitCardProps) => {
  return (
    <div className="flex flex-col gap-2 mt-2">
      <HeaderLabel
        label="Session Started"
        variant="success"
        isActive={showIndicator}
        showIndicator={showIndicator}
      />
      <div className="flex flex-col rounded-xl px-4 py-2 border border-ink-900/10 bg-surface-secondary space-y-1">
        <InfoItem name="Conversation ID" value={message.conversationId || "-"} />
        <InfoItem name="Model" value={message.model || "-"} />
      </div>
    </div>
  );
};

// ============================================================================
// User Prompt Card
// ============================================================================

export interface UserPromptCardProps {
  message: UserPromptCardMessage;
  showIndicator?: boolean;
}

export const UserPromptCard = ({
  message,
  showIndicator = false,
}: UserPromptCardProps) => {
  const MDContent = require("../../../../render/markdown").default;

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        User
      </div>
      <MDContent text={message.prompt} />
      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {message.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-[160px] max-w-[220px] flex-col overflow-hidden rounded-2xl border border-ink-900/10 bg-white"
            >
              {attachment.kind === "image" ? (
                <div className="h-28 w-full overflow-hidden bg-ink-900/5">
                  <img
                    src={attachment.url}
                    alt={attachment.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-full items-center justify-center bg-ink-900/5 text-xs font-semibold uppercase tracking-wide text-ink-700">
                  {attachment.name.split(".").pop()?.slice(0, 6) || "FILE"}
                </div>
              )}
              <div className="flex flex-col gap-1 px-3 py-2 text-left text-xs text-ink-600">
                <span className="truncate font-medium text-ink-800">{attachment.name}</span>
                <span className="text-ink-500">{formatBytes(attachment.size)}</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};
