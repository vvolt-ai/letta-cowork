import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import type { EmailInboxModalProps } from "../../types";
import { useEmailInbox } from "./hooks/useEmailInbox";
import { ZohoMailEmbed } from "./ZohoMailEmbed";
import { ConversationViewer } from "../../../chat/components/ConversationViewer";
import { SendToAgentConfirmationModal } from "./SendToAgentConfirmationModal";

/**
 * Email Inbox Modal - Zoho-first, full-screen
 *
 * - Zoho Mail webview always fills the body
 * - Header keeps the app-owned actions (Send to Agent, View Conversation)
 * - Buttons are driven by `activeZohoMailId`, which is updated whenever the
 *   embedded Zoho webview navigates to a different email.
 */
export function EmailInboxModal({
  open,
  onOpenChange,
  emails,
  isProcessingEmailInput: _isProcessingEmailInput,
  selectedAgentId,
  onProcessEmailToAgent,
  processingEmailId,
  awaitingConversationEmailId,
  errorEmailId,
  newlyCreatedConversations,
  onRefresh,
  onLoadMore,
  isLoadingMore = false,
  hasMore = false,
  accountId,
  folderId,
}: EmailInboxModalProps) {
  const {
    selectedEmail,
    handleSelectEmail,
    handleProcessEmailToAgent,
    handleViewConversation,
    viewingConversationId,
    handleBackFromConversation,
    isEmailProcessed,
    findConversationIdForEmail,
  } = useEmailInbox({
    open,
    accountId,
    folderId,
    emails,
    extraLookupEmails: undefined,
    onProcessEmailToAgent,
    newlyCreatedConversations,
    onLoadMore,
    isLoadingMore,
    hasMore,
    processingEmailId,
    awaitingConversationEmailId,
    errorEmailId,
  });

  const [activeZohoMailId, setActiveZohoMailId] = useState<string | null>(null);

  // Reset active id when the modal closes
  useEffect(() => {
    if (!open) setActiveZohoMailId(null);
  }, [open]);

  const activeEmail = useMemo(() => {
    if (!activeZohoMailId) return selectedEmail;
    return (
      emails.find((e) => String(e.messageId) === String(activeZohoMailId)) ??
      selectedEmail
    );
  }, [emails, selectedEmail, activeZohoMailId]);

  const activeConversationId = activeEmail ? findConversationIdForEmail(activeEmail) : null;
  const activeIsProcessed = activeEmail ? isEmailProcessed(activeEmail) : false;

  const handleZohoMailIdChange = (mailId: string | null) => {
    setActiveZohoMailId(mailId);
    if (!mailId) return;
    const matched = emails.find((e) => String(e.messageId) === String(mailId));
    if (matched && matched.messageId !== selectedEmail?.messageId) {
      void handleSelectEmail(matched);
    }
  };

  const activeMessageId = activeEmail ? String(activeEmail.messageId) : null;
  const isProcessing = Boolean(activeMessageId && String(processingEmailId) === activeMessageId);
  const isAwaitingConversation = Boolean(
    activeMessageId && String(awaitingConversationEmailId) === activeMessageId
  );
  const hasSendError = Boolean(activeMessageId && String(errorEmailId) === activeMessageId);
  const isSendBusy = isProcessing || isAwaitingConversation;

  const canSendToAgent = Boolean(activeEmail && selectedAgentId) && !isSendBusy;
  const canViewConversation = Boolean(activeConversationId);

  const [showConfirmSend, setShowConfirmSend] = useState(false);

  const onClickSendToAgent = () => {
    if (!activeEmail || !selectedAgentId || isSendBusy) return;
    setShowConfirmSend(true);
  };

  const onConfirmSend = (additionalInstructions?: string) => {
    if (!activeEmail || !selectedAgentId) return;
    void handleProcessEmailToAgent(activeEmail, selectedAgentId, additionalInstructions);
  };

  const onClickViewConversation = () => {
    if (!activeConversationId) return;
    handleViewConversation(activeConversationId);
  };

  const sendButtonLabel = (() => {
    if (isProcessing) return "Processing...";
    if (isAwaitingConversation) return "Fetching...";
    if (hasSendError) return "Failed - Retry";
    if (activeIsProcessed) return "Re-send to Agent";
    return "Send to Agent";
  })();

  const sendButtonClass = (() => {
    if (hasSendError) {
      return "bg-red-100 text-red-700 border border-red-300 hover:bg-red-200";
    }
    return "bg-accent text-white hover:bg-accent-hover";
  })();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-1 z-50 h-[calc(100vh-8px)] w-[calc(100vw-8px)] rounded-lg border border-[var(--color-border)] bg-white shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 shrink-0">
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
            <div className="flex items-center gap-2">
              <button
                onClick={onClickSendToAgent}
                disabled={!canSendToAgent && !hasSendError}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed ${sendButtonClass}`}
                title={
                  !selectedAgentId
                    ? "Pick an agent first"
                    : activeEmail
                    ? `Send "${activeEmail.subject || activeEmail.messageId}" to agent`
                    : "Open an email inside Zoho first"
                }
              >
                <span className="flex items-center justify-center gap-1">
                  {(isProcessing || isAwaitingConversation) && (
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {hasSendError && (
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}
                  {sendButtonLabel}
                </span>
              </button>
              <button
                onClick={onClickViewConversation}
                disabled={!canViewConversation}
                className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  canViewConversation
                    ? "View conversation for this email"
                    : "No conversation yet for this email"
                }
              >
                View Conversation
              </button>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-ink-500 hover:bg-ink-900/10" aria-label="Close inbox">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Body: full-bleed Zoho webview */}
          <div className="relative flex-1 min-h-0 bg-white flex">
            <ZohoMailEmbed
              initialMessageId={selectedEmail?.messageId}
              onMailIdChange={handleZohoMailIdChange}
            />

            {/* Confirmation modal for Send to Agent */}
            <SendToAgentConfirmationModal
              open={showConfirmSend}
              onOpenChange={setShowConfirmSend}
              onConfirm={onConfirmSend}
              emailSubject={activeEmail?.subject}
            />

            {/* Conversation overlay drawer */}
            {viewingConversationId && (
              <div className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[520px] flex-col border-l border-[var(--color-border)] bg-white shadow-xl">
                <ConversationViewer
                  sessionId={viewingConversationId}
                  onBack={handleBackFromConversation}
                  showBackButton={true}
                  showOpenInLetta={true}
                  fullWidthComposer={true}
                />
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type { EmailInboxModalProps } from "../../types";
