import * as Dialog from "@radix-ui/react-dialog";
import { ConversationViewer } from "../../../chat/components/ConversationViewer";
import type { EmailInboxModalProps } from "../../types";
import { useEmailInbox } from "./hooks/useEmailInbox";
import { useEmailFilters } from "./hooks/useEmailFilters";
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
  successEmailId,
  newlyCreatedConversations,
  onRefresh,
  onSearch,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  accountId,
  folderId,
}: EmailInboxModalProps) {
  // Use custom hooks for state management
  const {
    localSelectedId,
    selectedEmail,
    localEmailDetails,
    localEmailDetailsError,
    isFetchingLocalContent,
    processedEmailsFromServer,
    viewingConversationId,
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
    onProcessEmailToAgent,
    newlyCreatedConversations,
    onLoadMore,
    isLoadingMore,
    hasMore,
  });

  const {
    searchQuery,
    handleSearch,
    handleClearSearch,
    handleSearchChange,
  } = useEmailFilters(onSearch);

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

          {/* Search Bar */}
          {onSearch && (
            <EmailSearchBar
              searchQuery={searchQuery}
              onSearch={handleSearch}
              onSearchChange={handleSearchChange}
              onClearSearch={handleClearSearch}
            />
          )}

          {/* Main Content - Split Layout */}
          <div className={`flex flex-1 min-h-0 ${isResizingList ? "select-none cursor-col-resize" : ""}`}>
            {/* Left Side - Email List */}
            <EmailList
              emails={emails}
              isFetching={isFetching}
              localSelectedId={localSelectedId}
              selectedEmailSubject={selectedEmail?.subject}
              processedEmailsFromServer={processedEmailsFromServer}
              isEmailProcessed={isEmailProcessed}
              onSelectEmail={handleSelectEmail}
              onScroll={handleScroll}
              scrollContainerRef={scrollContainerRef}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
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
                  successEmailId={successEmailId}
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
