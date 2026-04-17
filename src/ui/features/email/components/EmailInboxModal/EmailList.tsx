import type { ZohoEmail } from "../../../../types";
import type { ProcessedEmailData, EmailStatusInfo } from "../../types";
import { EmailListItem } from "./EmailListItem";
import { EmailFilters } from "./EmailFilters";

interface EmailListProps {
  emails: ZohoEmail[];
  isFetching: boolean;
  localSelectedId: string | null;
  selectedEmailSubject?: string;
  processedEmailsFromServer: Map<string, ProcessedEmailData>;
  emailStatusById: Map<string, EmailStatusInfo>;
  isEmailProcessed: (email: ZohoEmail) => boolean;
  onSelectEmail: (email: ZohoEmail) => void;
  onScroll: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  listWidth: number;
}

/**
 * List of emails with scroll handling for infinite loading
 */
export function EmailList({
  emails,
  isFetching,
  localSelectedId,
  selectedEmailSubject,
  emailStatusById,
  isEmailProcessed,
  onSelectEmail,
  onScroll,
  scrollContainerRef,
  hasMore = false,
  isLoadingMore = false,
  listWidth,
}: EmailListProps) {
  return (
    <div style={{ width: `${listWidth}px` }} className="shrink-0 border-r border-[var(--color-border)] flex flex-col">
      <EmailFilters
        emailCount={emails.length}
        selectedEmailSubject={selectedEmailSubject}
      />
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={onScroll}
      >
        {isFetching && emails.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            Loading emails…
          </div>
        ) : emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted">
            <svg className="h-12 w-12 mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16v16H4z" />
              <path d="M4 4l8 8 8-8" />
            </svg>
            <p className="text-sm">No emails found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {emails.map((email) => (
              <EmailListItem
                key={email.messageId}
                email={email}
                isSelected={localSelectedId === email.messageId}
                isProcessed={isEmailProcessed(email)}
                statusInfo={emailStatusById.get(String(email.messageId))}
                onSelect={onSelectEmail}
              />
            ))}
            {/* Load more indicator */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-3">
                <svg className="h-4 w-4 animate-spin text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle className="opacity-20" cx="12" cy="12" r="10" />
                  <path d="M4 12a8 8 0 018-8" />
                </svg>
                <span className="ml-2 text-xs text-muted">Loading more...</span>
              </div>
            )}
            {!hasMore && emails.length > 0 && !isLoadingMore && (
              <div className="py-3 text-center text-xs text-muted">
                No more emails
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
