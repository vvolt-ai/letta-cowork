import type { ZohoEmail } from "../types";

interface SidebarEmailListProps {
  emails: ZohoEmail[];
  selectedEmailId?: string;
  isFetching: boolean;
  isProcessingEmailInput?: boolean;
  onSelectEmail: (email: ZohoEmail) => void;
  onViewEmail: (email: ZohoEmail) => void;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  onClose: () => void;
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string) => void;
  processingEmailId?: string | null;
  successEmailId?: string | null;
}

const isUnreadEmail = (email: ZohoEmail) => {
  const status = String(email.status ?? "").toLowerCase();
  const status2 = String(email.status2 ?? "").toLowerCase();
  return (
    status.includes("unread") ||
    status2.includes("unread") ||
    status === "0" ||
    status2 === "0"
  );
};

export function SidebarEmailList({
  emails,
  selectedEmailId,
  isFetching,
  isProcessingEmailInput,
  onSelectEmail,
  onViewEmail,
  onUseEmailAsInput,
  onClose,
  selectedAgentId,
  onProcessEmailToAgent,
  processingEmailId,
  successEmailId,
}: SidebarEmailListProps) {
  const formatDate = (timestamp: string) => {
    const ms = Number(timestamp);
    if (!Number.isFinite(ms)) return "";
    return new Date(ms).toLocaleDateString();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink-800">Emails</div>
        <button
          className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {isFetching ? (
        <div className="rounded-xl border border-ink-900/5 bg-surface px-3 py-3 text-xs text-muted">
          Loading emails...
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {emails.length === 0 ? (
            <div className="rounded-xl border border-ink-900/5 bg-surface px-3 py-3 text-xs text-muted">
              No emails found.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {emails.map((email) => {
                const isUnread = isUnreadEmail(email);
                const isSelected = selectedEmailId === email.messageId;
                return (
                  <div
                    key={email.messageId}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition cursor-pointer ${
                      isSelected
                        ? "border-accent/35 bg-accent-subtle"
                        : isUnread
                          ? "border-accent/30 bg-accent-subtle/50 hover:bg-accent-subtle"
                          : "border-ink-900/5 bg-surface hover:bg-surface-tertiary"
                    }`}
                    onClick={() => onSelectEmail(email)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectEmail(email);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${isUnread ? "font-semibold text-ink-900" : "font-medium text-ink-800"}`}>
                        {email.sender || email.fromAddress || "Unknown sender"}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted">
                          {formatDate(email.receivedTime)}
                        </span>
                        <button
                          className="rounded-md border border-ink-900/10 bg-surface p-1 text-ink-600 hover:bg-surface-tertiary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewEmail(email);
                          }}
                          aria-label="View email details"
                          title="View email details"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M1.5 12s3.5-6 10.5-6 10.5 6 10.5 6-3.5 6-10.5 6S1.5 12 1.5 12z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button
                          className="rounded-md border border-ink-900/10 bg-surface p-1 text-ink-600 hover:bg-surface-tertiary disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUseEmailAsInput(email);
                          }}
                          disabled={isProcessingEmailInput}
                          aria-label="Use email as chat input"
                          title={isProcessingEmailInput ? "Processing email..." : "Use email as chat input"}
                        >
                          {isProcessingEmailInput ? (
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                              <path d="M12 2a10 10 0 0 1 10 10" />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M4 5h16v10H7l-3 3z" />
                            </svg>
                          )}
                        </button>
                        {selectedAgentId && onProcessEmailToAgent && (
                          <button
                            className="rounded-md border border-ink-900/10 bg-surface p-1 text-ink-600 hover:bg-surface-tertiary disabled:opacity-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              onProcessEmailToAgent(email, selectedAgentId);
                            }}
                            disabled={!!processingEmailId}
                            aria-label="Process email to agent"
                            title={String(processingEmailId) === String(email.messageId) ? "Processing..." : String(successEmailId) === String(email.messageId) ? "Sent to agent!" : "Process email to agent session"}
                          >
                            {String(successEmailId) === String(email.messageId) ? (
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-green-600" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            ) : String(processingEmailId) === String(email.messageId) ? (
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                                <path d="M12 2a10 10 0 0 1 10 10" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`mt-1 truncate text-xs ${isUnread ? "font-semibold text-ink-900" : "text-ink-700"}`}>
                      {email.subject || "(No subject)"}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">
                      {email.summary || "No preview"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
