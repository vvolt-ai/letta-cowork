import type { ZohoEmail } from "../../../../types";
import { isUnreadEmail, formatDate, type EmailStatusInfo } from "../../types";

interface EmailListItemProps {
  email: ZohoEmail;
  isSelected: boolean;
  isProcessed: boolean;
  statusInfo?: EmailStatusInfo | null;
  onSelect: (email: ZohoEmail) => void;
}

/**
 * Individual email row in the list
 */
export function EmailListItem({
  email,
  isSelected,
  isProcessed,
  statusInfo,
  onSelect,
}: EmailListItemProps) {
  const isUnread = isUnreadEmail(email);

  return (
    <button
      className={`w-full text-left rounded-lg border px-3 py-2 transition relative ${
        isSelected
          ? "border-accent bg-accent/10"
          : isProcessed
            ? "border-green-300 bg-green-50"
            : isUnread
              ? "border-accent/30 bg-accent/5 hover:bg-accent/10"
              : "border-transparent hover:bg-ink-900/5"
      }`}
      onClick={() => onSelect(email)}
    >
      {isProcessed && (
        <span className="absolute top-1 right-1 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full">
          ✓ Processed
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-sm ${isUnread ? "font-semibold text-ink-900" : "font-medium text-ink-800"}`}>
          {email.sender || email.fromAddress || "Unknown"}
        </span>
        <span className="text-[11px] text-muted shrink-0">
          {formatDate(email.receivedTime)}
        </span>
      </div>
      <div className={`mt-0.5 truncate text-sm ${isUnread ? "font-medium text-ink-800" : "text-ink-700"}`}>
        {email.subject || "(No subject)"}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted">
        {email.summary?.slice(0, 60) || "No preview"}
      </div>
      {statusInfo ? (
        <div className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${statusInfo.textClass}`}>
          <span className={`h-2 w-2 rounded-full ${statusInfo.dotClass}`} aria-hidden />
          <span>{statusInfo.label}</span>
        </div>
      ) : null}
    </button>
  );
}
