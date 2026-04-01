import { useState, useCallback, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ZohoEmail } from "../types";
import { useAppStore } from "../store/useAppStore";
import { useShallow } from "zustand/react/shallow";
import { ConversationViewer } from "./ConversationViewer";

interface EmailInboxModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emails: ZohoEmail[];
  isFetching: boolean;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  isProcessingEmailInput?: boolean;
  selectedAgentId?: string;
  onProcessEmailToAgent?: (email: ZohoEmail, agentId: string) => void;
  processingEmailId?: string | null;
  successEmailId?: string | null;
  onRefresh?: () => void;
  onSearch?: (query: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  accountId?: string;
  folderId?: string;
}

const SCROLL_THRESHOLD = 50;
const DEFAULT_LIST_WIDTH = 420;
const MIN_LIST_WIDTH = 320;
const MAX_LIST_WIDTH = 620;

const clampListWidth = (value: number) => Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, value));

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

const extractContent = (details: unknown) => {
  if (!details || typeof details !== "object") return "";
  const data = (details as any).data ?? details;
  return (
    data?.content ??
    data?.htmlContent ??
    data?.message ??
    data?.summary ??
    ""
  );
};

const isHtmlContent = (content: string) => /<\/?[a-z][\s\S]*>/i.test(content);

const formatDate = (timestamp: string) => {
  const ms = Number(timestamp);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export function EmailInboxModal({
  open,
  onOpenChange,
  emails,
  isFetching,
  onUseEmailAsInput,
  isProcessingEmailInput,
  selectedAgentId,
  onProcessEmailToAgent,
  processingEmailId,
  successEmailId,
  onRefresh,
  onSearch,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  accountId,
  folderId,
}: EmailInboxModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [localEmailDetails, setLocalEmailDetails] = useState<unknown>(null);
  const [localEmailDetailsError, setLocalEmailDetailsError] = useState<string | null>(null);
  const [isFetchingLocalContent, setIsFetchingLocalContent] = useState(false);
  const [processedEmailIds, setProcessedEmailIds] = useState<Set<string>>(new Set());
  const [viewingConversationId, setViewingConversationId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(DEFAULT_LIST_WIDTH);
  const [isResizingList, setIsResizingList] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Get session data from store to find email conversations
  const sessions = useAppStore(useShallow((state) => state.sessions));

  // Get selected email from local state
  const selectedEmail = emails.find(e => e.messageId === localSelectedId);

  // Load processed email IDs when modal opens
  useEffect(() => {
    if (open && accountId && folderId) {
      window.electron.getProcessedUnreadEmailIds(accountId, folderId)
        .then((ids) => {
          setProcessedEmailIds(new Set(ids));
          console.log(`[EmailInboxModal] Loaded ${ids.length} processed email IDs`);
        })
        .catch((err) => {
          console.warn(`[EmailInboxModal] Failed to load processed IDs:`, err);
        });
    }
  }, [open, accountId, folderId]);

  // Clear processed IDs when modal closes
  useEffect(() => {
    if (!open) {
      setProcessedEmailIds(new Set());
    }
  }, [open]);

  // Check if an email is already processed
  const isEmailProcessed = useCallback((email: ZohoEmail) => {
    return processedEmailIds.has(String(email.messageId));
  }, [processedEmailIds]);

  // Find conversation ID for a processed email by looking at sessions
  const findConversationIdForEmail = useCallback((email: ZohoEmail): string | null => {
    const emailSubject = email.subject || String(email.messageId);
    // Look for sessions with title matching "Email: {subject}" or containing the email subject
    for (const session of Object.values(sessions)) {
      // Check if it's an email session or if the title starts with "Email:"
      const isEmailRelatedSession = session.isEmailSession || session.title?.startsWith("Email:");
      if (isEmailRelatedSession && session.title?.includes(emailSubject)) {
        return session.id;
      }
    }
    return null;
  }, [sessions]);

  // Handle process email to agent - update local state after success
  const handleProcessEmailToAgent = useCallback(async (email: ZohoEmail, agentId: string) => {
    if (!onProcessEmailToAgent) return;
    
    await onProcessEmailToAgent(email, agentId);
    
    // Update local state to mark as processed immediately
    setProcessedEmailIds(prev => new Set(prev).add(String(email.messageId)));
  }, [onProcessEmailToAgent]);

  // Handle view conversation - show in modal
  const handleViewConversation = useCallback((conversationId: string) => {
    setViewingConversationId(conversationId);
  }, []);

  const handleOpenInLetta = useCallback((conversationId: string) => {
    const session = sessions[conversationId];
    if (!session?.agentId) return;
    const lettaUrl = `https://app.letta.com/projects/default-project/agents/${session.agentId}?conversation=${conversationId}`;
    window.electron.openExternal(lettaUrl);
  }, [sessions]);

  // Handle back from conversation view
  const handleBackFromConversation = useCallback(() => {
    setViewingConversationId(null);
  }, []);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !onLoadMore || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isNearBottom) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore]);

  // Handle email selection - fetch details locally without triggering parent re-render
  const handleSelectEmail = useCallback(async (email: ZohoEmail) => {
    // Clear conversation view when selecting a new email
    setViewingConversationId(null);

    setLocalSelectedId(email.messageId);
    setLocalEmailDetails(null);
    setLocalEmailDetailsError(null);
    setIsFetchingLocalContent(true);

    try {
      // Fetch email details directly from electron
      const details = await window.electron.fetchEmailById(
        email.accountId || '',
        email.folderId || '',
        email.messageId
      );
      setLocalEmailDetails(details);
    } catch (err) {
      console.error("Failed to fetch email details:", err);
      setLocalEmailDetailsError("Failed to load email content");
    } finally {
      setIsFetchingLocalContent(false);
    }
  }, []);

  // Handle search
  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  }, [onSearch, searchQuery]);

  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizingList(true);
  }, []);

  useEffect(() => {
    if (!isResizingList) return;

    const handleMouseMove = (event: MouseEvent) => {
      setListWidth(clampListWidth(event.clientX));
    };

    const handleMouseUp = () => {
      setIsResizingList(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingList]);

  // Clear local state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setLocalSelectedId(null);
      setLocalEmailDetails(null);
      setLocalEmailDetailsError(null);
      setViewingConversationId(null);
    }
  }, [open]);

  // Extract content for preview
  const content = extractContent(localEmailDetails);
  const html = isHtmlContent(content);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-1 z-50 h-[calc(100vh-8px)] w-[calc(100vw-8px)] rounded-lg border border-ink-900/10 bg-surface shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-ink-900/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <Dialog.Title className="text-lg font-semibold text-ink-900">
                📧 Inbox
              </Dialog.Title>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="rounded-lg border border-ink-900/10 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                  title="Refresh emails"
                >
                  ↻ Refresh
                </button>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-ink-500 hover:bg-ink-900/10" aria-label="Close inbox">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Search Bar */}
          {onSearch && (
            <form onSubmit={handleSearch} className="px-4 py-2 border-b border-ink-900/10">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search emails by subject, sender, or content..."
                    className="w-full rounded-lg border border-ink-900/10 bg-white py-2 pl-10 pr-4 text-sm text-ink-800 placeholder:text-muted focus:border-accent/40 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                >
                  Search
                </button>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      onSearch("");
                    }}
                    className="rounded-lg border border-ink-900/10 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-surface-tertiary"
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Main Content - Split Layout */}
          <div className={`flex flex-1 min-h-0 ${isResizingList ? "select-none cursor-col-resize" : ""}`}>
            {/* Left Side - Email List */}
            <div style={{ width: `${listWidth}px` }} className="shrink-0 border-r border-ink-900/10 flex flex-col">
              <div className="px-3 py-2 border-b border-ink-900/10 text-xs text-muted">
                {emails.length} email{emails.length !== 1 ? 's' : ''}
                {selectedEmail && ` • ${selectedEmail.subject?.slice(0, 30)}...`}
              </div>
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto"
                onScroll={handleScroll}
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
                    {emails.map((email) => {
                      const isUnread = isUnreadEmail(email);
                      const isSelected = localSelectedId === email.messageId;
                      const isProcessed = isEmailProcessed(email);
                      return (
                        <button
                          key={email.messageId}
                          className={`w-full text-left rounded-lg border px-3 py-2 transition relative ${
                            isSelected
                              ? "border-accent bg-accent/10"
                              : isProcessed
                                ? "border-green-300 bg-green-50"
                                : isUnread
                                  ? "border-accent/30 bg-accent/5 hover:bg-accent/10"
                                  : "border-transparent hover:bg-ink-900/5"
                          }`}
                          onClick={() => handleSelectEmail(email)}
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
                        </button>
                      );
                    })}
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

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize email list"
              onMouseDown={handleResizeStart}
              className={`group relative w-1 shrink-0 bg-transparent ${isResizingList ? "cursor-col-resize" : "cursor-col-resize hover:bg-accent/10"}`}
            >
              <div className={`absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full transition ${isResizingList ? "bg-accent/60" : "bg-transparent group-hover:bg-accent/40"}`} />
            </div>

            {/* Right Side - Email Preview or Conversation Viewer */}
            <div className="flex-1 flex flex-col bg-white min-w-0">
              {viewingConversationId ? (
                <ConversationViewer
                  sessionId={viewingConversationId}
                  onBack={handleBackFromConversation}
                  showBackButton={true}
                  showOpenInLetta={true}
                  fullWidthComposer={true}
                />
              ) : selectedEmail ? (
                /* Email Preview */
                <>
                  {/* Email Header */}
                  <div className="px-3 py-2 border-b border-ink-900/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold text-ink-900 truncate">
                          {selectedEmail.subject || "(No subject)"}
                        </h2>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                          <span className="font-medium text-ink-700">
                            {selectedEmail.sender || selectedEmail.fromAddress}
                          </span>
                          {selectedEmail.toAddress && (
                            <>
                              <span>→</span>
                              <span>{selectedEmail.toAddress}</span>
                            </>
                          )}
                          <span className="ml-auto">
                            {new Date(Number(selectedEmail.receivedTime)).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onUseEmailAsInput(selectedEmail)}
                          disabled={isProcessingEmailInput}
                          className="rounded-lg border border-ink-900/10 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary disabled:opacity-50"
                          title="Use email as chat input"
                        >
                          💬 Use in Chat
                        </button>
                        {selectedAgentId && onProcessEmailToAgent && (
                          isEmailProcessed(selectedEmail) ? (
                            <>
                              {(() => {
                                const conversationId = findConversationIdForEmail(selectedEmail);
                                if (!conversationId) return null;
                                const session = sessions[conversationId];
                                return (
                                  <>
                                    <button
                                      onClick={() => handleViewConversation(conversationId)}
                                      className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                                      title="View conversation"
                                    >
                                      👁 View Conversation
                                    </button>
                                    {session?.agentId ? (
                                      <button
                                        onClick={() => handleOpenInLetta(conversationId)}
                                        className="rounded-lg border border-ink-900/10 bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                                        title="Open in Letta"
                                      >
                                        Open in Letta
                                      </button>
                                    ) : null}
                                  </>
                                );
                              })()}
                            </>
                          ) : (
                            <button
                              onClick={() => handleProcessEmailToAgent(selectedEmail, selectedAgentId)}
                              disabled={!!processingEmailId}
                              className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                              title="Process email to agent"
                            >
                              {String(successEmailId) === String(selectedEmail.messageId) ? (
                                "✓ Sent!"
                              ) : String(processingEmailId) === String(selectedEmail.messageId) ? (
                                "Processing..."
                              ) : (
                                "→ Send to Agent"
                              )}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="flex-1 overflow-auto p-3">
                    {isFetchingLocalContent ? (
                      <div className="flex items-center justify-center py-12 text-sm text-muted">
                        Loading email content…
                      </div>
                    ) : localEmailDetailsError ? (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                        {localEmailDetailsError}
                      </div>
                    ) : html ? (
                      <iframe
                        title="Email content"
                        className="w-full h-full min-h-[400px] rounded-lg border border-ink-900/10"
                        sandbox=""
                        srcDoc={content}
                      />
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        {content || selectedEmail.summary || (
                          <div className="text-center text-muted py-8">
                            No content available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-muted">
                  <svg className="h-16 w-16 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4h16v16H4z" />
                    <path d="M4 4l8 8 8-8" />
                  </svg>
                  <p className="text-sm">Select an email to preview</p>
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
