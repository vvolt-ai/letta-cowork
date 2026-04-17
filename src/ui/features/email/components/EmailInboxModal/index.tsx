import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ZohoEmail } from "../../../../types";
import { ConversationViewer } from "../../../chat/components/ConversationViewer";
import type { EmailInboxModalProps } from "../../types";
import { useEmailInbox } from "./hooks/useEmailInbox";
import { buildZohoSearchKey, filterEmails } from "./hooks/useEmailFilters";
import { EmailSearchBar } from "./EmailSearchBar";
import { EmailList } from "./EmailList";
import { EmailPreview } from "./EmailPreview";

/**
 * Email Inbox Modal - Main component
 * Displays a list of emails with preview and conversation viewing capabilities
 */
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
  awaitingConversationEmailId,
  errorEmailId,
  newlyCreatedConversations,
  onRefresh,
  onSearch,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  accountId,
  folderId,
}: EmailInboxModalProps) {
  // Progressive search: instant local filter + debounced full-inbox server search.
  // Declared first so `serverResults` is available as an extra lookup pool for
  // `useEmailInbox` (enables selecting server-only search results).
  const [searchQuery, setSearchQuery] = useState("");
  const [serverResults, setServerResults] = useState<ZohoEmail[] | null>(null);
  const [serverSearching, setServerSearching] = useState(false);
  const [serverSearchError, setServerSearchError] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);

  const isSearching = searchQuery.trim().length > 0;

  // Use custom hooks for state management
  const {
    localSelectedId,
    selectedEmail,
    localEmailDetails,
    localEmailDetailsError,
    isFetchingLocalContent,
    processedEmailsFromServer,
    viewingConversationId,
    emailStatusById,
    listWidth,
    isResizingList,
    scrollContainerRef,
    handleSelectEmail,
    handleProcessEmailToAgent,
    handleViewConversation,
    handleBackFromConversation,
    handleOpenInLetta,
    handleScroll,
    handleResizeStart,
    isEmailProcessed,
    findConversationIdForEmail,
  } = useEmailInbox({
    open,
    accountId,
    folderId,
    emails,
    extraLookupEmails: serverResults ?? undefined,
    onProcessEmailToAgent,
    newlyCreatedConversations,
    onLoadMore,
    isLoadingMore,
    hasMore,
    processingEmailId,
    awaitingConversationEmailId,
    errorEmailId,
  });

  const handleSearchChange = (value: string) => setSearchQuery(value);
  const handleClearSearch = () => {
    setSearchQuery("");
    if (onSearch) onSearch("");
  };
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) onSearch(searchQuery.trim());
  };

  // Reset search state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setServerResults(null);
      setServerSearching(false);
      setServerSearchError(null);
    }
  }, [open]);

  const localMatches = useMemo(
    () => (isSearching ? filterEmails(emails, { searchQuery }) : emails),
    [isSearching, emails, searchQuery]
  );

  // Debounced full-inbox search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setServerResults(null);
      setServerSearching(false);
      setServerSearchError(null);
      return;
    }

    const rid = ++searchRequestIdRef.current;
    setServerSearching(true);
    setServerSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        const searchKey = buildZohoSearchKey(q);
        const resp: any = await (window as any).electron.searchEmails(
          accountId,
          { searchKey, limit: 50 }
        );
        if (rid !== searchRequestIdRef.current) return;
        const data: ZohoEmail[] = Array.isArray(resp?.data)
          ? (resp.data as ZohoEmail[])
          : Array.isArray(resp)
            ? (resp as ZohoEmail[])
            : [];
        setServerResults(data);
      } catch (err) {
        if (rid !== searchRequestIdRef.current) return;
        setServerSearchError(err instanceof Error ? err.message : "Search failed");
        setServerResults(null);
      } finally {
        if (rid === searchRequestIdRef.current) setServerSearching(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [searchQuery, accountId]);

  // Merged list: local matches first (stable scroll), then server-only matches
  const displayedEmails = useMemo<ZohoEmail[]>(() => {
    if (!isSearching) return emails;
    if (!serverResults) return localMatches;
    const seen = new Set<string>();
    const out: ZohoEmail[] = [];
    for (const e of localMatches) {
      const key = String(e.messageId ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    for (const e of serverResults) {
      const key = String(e.messageId ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }, [isSearching, emails, localMatches, serverResults]);

  const serverOnlyCount = useMemo(() => {
    if (!serverResults || !isSearching) return 0;
    const localKeys = new Set(localMatches.map((e) => String(e.messageId ?? "")));
    return serverResults.filter((e) => {
      const k = String(e.messageId ?? "");
      return k && !localKeys.has(k);
    }).length;
  }, [serverResults, localMatches, isSearching]);

  // Get conversation ID and agent ID for selected email
  const selectedConversationId = selectedEmail ? findConversationIdForEmail(selectedEmail) : null;
  const selectedIsProcessed = selectedEmail ? isEmailProcessed(selectedEmail) : false;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-1 z-50 h-[calc(100vh-8px)] w-[calc(100vw-8px)] rounded-lg border border-[var(--color-border)] bg-white shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <div className="flex items-center gap-3">
              <Dialog.Title className="text-lg font-semibold text-ink-900">
                📧 Inbox
              </Dialog.Title>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-gray-50"
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

          {/* Search Bar — always shown */}
          <EmailSearchBar
            searchQuery={searchQuery}
            onSearch={handleSearch}
            onSearchChange={handleSearchChange}
            onClearSearch={handleClearSearch}
          />

          {/* Search status strip */}
          {isSearching && (
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-gray-50 px-4 py-1.5 text-[11px] text-ink-600">
              <div className="flex items-center gap-2">
                {serverSearching ? (
                  <>
                    <svg className="h-3 w-3 animate-spin text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle className="opacity-20" cx="12" cy="12" r="10" />
                      <path d="M4 12a8 8 0 018-8" />
                    </svg>
                    <span>Searching full inbox for &ldquo;{searchQuery}&rdquo;…</span>
                  </>
                ) : serverSearchError ? (
                  <span className="text-red-600">Full-inbox search failed: {serverSearchError}</span>
                ) : serverResults ? (
                  <span>
                    <strong className="text-ink-900">{displayedEmails.length}</strong> match
                    {displayedEmails.length === 1 ? "" : "es"} — {localMatches.length} local
                    {serverOnlyCount > 0 ? ` + ${serverOnlyCount} older from server` : ""}
                  </span>
                ) : (
                  <span>{localMatches.length} local matches (full-inbox search pending)</span>
                )}
              </div>
              <button
                onClick={handleClearSearch}
                className="rounded-md px-2 py-0.5 text-[11px] text-ink-600 hover:bg-gray-200 hover:text-ink-900"
              >
                Clear
              </button>
            </div>
          )}

          {/* Main Content - Split Layout */}
          <div className={`flex flex-1 min-h-0 ${isResizingList ? "select-none cursor-col-resize" : ""}`}>
            {/* Left Side - Email List */}
            <EmailList
              emails={displayedEmails}
              isFetching={isFetching}
              localSelectedId={localSelectedId}
              selectedEmailSubject={selectedEmail?.subject}
              processedEmailsFromServer={processedEmailsFromServer}
              emailStatusById={emailStatusById}
              isEmailProcessed={isEmailProcessed}
              onSelectEmail={handleSelectEmail}
              onScroll={handleScroll}
              scrollContainerRef={scrollContainerRef}
              hasMore={isSearching ? false : hasMore}
              isLoadingMore={isSearching ? false : isLoadingMore}
              listWidth={listWidth}
            />

            {/* Resize Handle */}
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
                <EmailPreview
                  email={selectedEmail}
                  localEmailDetails={localEmailDetails}
                  localEmailDetailsError={localEmailDetailsError}
                  isFetchingLocalContent={isFetchingLocalContent}
                  processingEmailId={processingEmailId}
                  awaitingConversationEmailId={awaitingConversationEmailId}
                  errorEmailId={errorEmailId}
                  isProcessingEmailInput={isProcessingEmailInput}
                  selectedAgentId={selectedAgentId}
                  processedEmailsFromServer={processedEmailsFromServer}
                  isEmailProcessed={selectedIsProcessed}
                  conversationId={selectedConversationId}
                  onUseEmailAsInput={onUseEmailAsInput}
                  onProcessEmailToAgent={handleProcessEmailToAgent}
                  onViewConversation={handleViewConversation}
                  onOpenInLetta={handleOpenInLetta}
                />
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

// Re-export types for convenience
export type { EmailInboxModalProps } from "../../types";
