import { useState, useCallback, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ZohoEmail } from "../types";
import { useAppStore } from "../store/useAppStore";
import { useShallow } from "zustand/react/shallow";

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
  const [conversationMessage, setConversationMessage] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  
  // Get session data from store to find email conversations
  const sessions = useAppStore(useShallow((state) => state.sessions));
  const sendEvent = useAppStore((state) => state.ipcSendEvent);

  // Get selected email from local state
  const selectedEmail = emails.find(e => e.messageId === localSelectedId);
  
  // Get the conversation being viewed
  const viewedConversation = viewingConversationId ? sessions[viewingConversationId] : null;

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

  // Handle view conversation - show in modal instead of closing
  const handleViewConversation = useCallback((conversationId: string) => {
    setViewingConversationId(conversationId);
    setConversationMessage("");
  }, []);

  // Handle send message in conversation
  const handleSendConversationMessage = useCallback(() => {
    if (!viewingConversationId || !conversationMessage.trim() || !sendEvent) return;
    
    sendEvent({
      type: "session.continue",
      payload: {
        sessionId: viewingConversationId,
        prompt: conversationMessage.trim(),
      },
    });
    
    setConversationMessage("");
  }, [viewingConversationId, conversationMessage, sendEvent]);

  // Handle back from conversation view
  const handleBackFromConversation = useCallback(() => {
    setViewingConversationId(null);
    setConversationMessage("");
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
    setConversationMessage("");
    
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

  // Clear local state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setLocalSelectedId(null);
      setLocalEmailDetails(null);
      setLocalEmailDetailsError(null);
      setViewingConversationId(null);
      setConversationMessage("");
    }
  }, [open]);

  // Extract content for preview
  const content = extractContent(localEmailDetails);
  const html = isHtmlContent(content);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 h-[85vh] w-[95vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-ink-900/10 bg-surface shadow-xl overflow-hidden flex flex-col">
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
          <div className="flex flex-1 min-h-0">
            {/* Left Side - Email List */}
            <div className="w-[380px] border-r border-ink-900/10 flex flex-col">
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

            {/* Right Side - Email Preview or Conversation Viewer */}
            <div className="flex-1 flex flex-col bg-white">
              {viewingConversationId ? (
                /* Conversation Viewer */
                <>
                  {/* Conversation Header */}
                  <div className="px-4 py-3 border-b border-ink-900/10 flex items-center gap-3">
                    <button
                      onClick={handleBackFromConversation}
                      className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-900/10"
                      title="Back to email"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base font-semibold text-ink-900 truncate">
                        {viewedConversation?.title || "Conversation"}
                      </h2>
                      <div className="text-xs text-muted">
                        {viewedConversation?.agentName || "Agent"}
                      </div>
                    </div>
                    {/* Status Badge */}
                    {(() => {
                      const status = viewedConversation?.ephemeral?.status;
                      const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
                        idle: { bg: "bg-gray-100", text: "text-gray-700", label: "Idle" },
                        thinking: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Thinking..." },
                        running_tool: { bg: "bg-blue-100", text: "text-blue-700", label: "Running Tool" },
                        waiting_approval: { bg: "bg-orange-100", text: "text-orange-700", label: "Waiting Approval" },
                        generating: { bg: "bg-blue-100", text: "text-blue-700", label: "Generating..." },
                        completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
                        error: { bg: "bg-red-100", text: "text-red-700", label: "Error" },
                      };
                      const config = statusConfig[status || "idle"] || statusConfig.idle;
                      return (
                        <span className={`text-xs ${config.bg} ${config.text} px-2 py-1 rounded-full`}>
                          {config.label}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Error Banner */}
                  {viewedConversation?.ephemeral?.errorMessage && (
                    <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4M12 16h.01" />
                        </svg>
                        <span className="text-sm text-red-700 flex-1">
                          {viewedConversation.ephemeral.errorMessage}
                        </span>
                        <button
                          onClick={() => {
                            // Retry by sending a continue message
                            if (sendEvent) {
                              sendEvent({
                                type: "session.continue",
                                payload: {
                                  sessionId: viewingConversationId,
                                  prompt: "Please continue.",
                                },
                              });
                            }
                          }}
                          className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Waiting Approval Banner */}
                  {viewedConversation?.ephemeral?.status === "waiting_approval" && viewedConversation?.permissionRequests?.length > 0 && (
                    <div className="px-4 py-2 bg-orange-50 border-b border-orange-200">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-orange-500 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        <span className="text-sm text-orange-700 flex-1">
                          Agent is waiting for approval to use: {viewedConversation.permissionRequests[0].toolName}
                        </span>
                        <button
                          onClick={() => {
                            // Approve and continue
                            const request = viewedConversation.permissionRequests[0];
                            if (request && sendEvent) {
                              sendEvent({
                                type: "permission.response",
                                payload: {
                                  sessionId: viewingConversationId,
                                  toolUseId: request.toolUseId,
                                  result: { allow: true } as any,
                                },
                              });
                            }
                          }}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            // Deny
                            const request = viewedConversation.permissionRequests[0];
                            if (request && sendEvent) {
                              sendEvent({
                                type: "permission.response",
                                payload: {
                                  sessionId: viewingConversationId,
                                  toolUseId: request.toolUseId,
                                  result: { allow: false } as any,
                                },
                              });
                            }
                          }}
                          className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Processing Indicator */}
                  {["thinking", "running_tool", "generating"].includes(viewedConversation?.ephemeral?.status || "") && (
                    <div className="px-4 py-2 bg-blue-50 border-b border-blue-200">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle className="opacity-20" cx="12" cy="12" r="10" />
                          <path d="M4 12a8 8 0 018-8" />
                        </svg>
                        <span className="text-sm text-blue-700">
                          {viewedConversation?.ephemeral?.status === "thinking" && "Agent is thinking..."}
                          {viewedConversation?.ephemeral?.status === "running_tool" && "Agent is running a tool..."}
                          {viewedConversation?.ephemeral?.status === "generating" && "Agent is generating response..."}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Conversation Messages */}
                  <div 
                    ref={conversationScrollRef}
                    className="flex-1 overflow-auto p-4 space-y-4"
                  >
                    {viewedConversation?.messages?.length ? (
                      viewedConversation.messages.map((msg: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 ${
                              msg.role === "user"
                                ? "bg-accent text-white"
                                : "bg-ink-100 text-ink-900"
                            }`}
                          >
                            {msg.content ? (
                              <div className="text-sm whitespace-pre-wrap">
                                {typeof msg.content === "string" 
                                  ? msg.content 
                                  : JSON.stringify(msg.content)}
                              </div>
                            ) : (
                              <div className="text-sm text-muted">No content</div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center justify-center py-12 text-muted">
                        <p className="text-sm">No messages yet</p>
                      </div>
                    )}
                  </div>

                  {/* Message Input */}
                  <div className="px-4 py-3 border-t border-ink-900/10">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={conversationMessage}
                        onChange={(e) => setConversationMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendConversationMessage();
                          }
                        }}
                        placeholder="Type a message..."
                        className="flex-1 rounded-lg border border-ink-900/10 bg-white px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:border-accent/40 focus:outline-none"
                      />
                      <button
                        onClick={handleSendConversationMessage}
                        disabled={!conversationMessage.trim() || ["thinking", "running_tool", "generating"].includes(viewedConversation?.ephemeral?.status || "")}
                        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : selectedEmail ? (
                /* Email Preview */
                <>
                  {/* Email Header */}
                  <div className="px-4 py-3 border-b border-ink-900/10">
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
                              <span className="rounded-lg bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                                ✓ Processed
                              </span>
                              {(() => {
                                const conversationId = findConversationIdForEmail(selectedEmail);
                                return conversationId ? (
                                  <button
                                    onClick={() => handleViewConversation(conversationId)}
                                    className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                                    title="View conversation"
                                  >
                                    👁 View Conversation
                                  </button>
                                ) : null;
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
                  <div className="flex-1 overflow-auto p-4">
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
