import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import type { EmailInboxModalProps } from "../../types";
import type { ZohoEmail } from "../../../../types";
import { useEmailInbox } from "./hooks/useEmailInbox";
import { ZohoMailEmbed, type ZohoMailNavigation } from "./ZohoMailEmbed";
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

  const [activeZohoNavigation, setActiveZohoNavigation] = useState<ZohoMailNavigation>({ kind: "none", rawId: null, url: "" });
  const activeZohoMailId = activeZohoNavigation.messageId ?? null;
  const [activeZohoUrl, setActiveZohoUrl] = useState<string>("");
  const [fetchedActiveEmail, setFetchedActiveEmail] = useState<ZohoEmail | null>(null);
  const [fetchingActiveEmailId, setFetchingActiveEmailId] = useState<string | null>(null);
  const [fetchingThreadId, setFetchingThreadId] = useState<string | null>(null);
  const [activeEmailFetchError, setActiveEmailFetchError] = useState<string | null>(null);

  // Reset active id when the modal closes
  useEffect(() => {
    if (!open) {
      setActiveZohoNavigation({ kind: "none", rawId: null, url: "" });
      setActiveZohoUrl("");
      setFetchedActiveEmail(null);
      setFetchingActiveEmailId(null);
      setFetchingThreadId(null);
      setActiveEmailFetchError(null);
    }
  }, [open]);

  const listActiveEmail = useMemo(() => {
    // Header actions should follow the email currently open inside the Zoho
    // webview, not the last locally selected email. When the user navigates back
    // to the inbox/list view, Zoho reports `mailId = null`, and the header must
    // disable "Send to Agent" / "View Conversation" instead of reusing stale state.
    if (!activeZohoMailId) return null;
    return emails.find((e) => String(e.messageId) === String(activeZohoMailId)) ?? null;
  }, [emails, activeZohoMailId]);

  const activeEmail = useMemo(() => {
    if (!activeZohoMailId) return null;
    if (listActiveEmail) return listActiveEmail;
    if (fetchedActiveEmail && String(fetchedActiveEmail.messageId) === String(activeZohoMailId)) {
      return fetchedActiveEmail;
    }
    return null;
  }, [activeZohoMailId, listActiveEmail, fetchedActiveEmail]);

  useEffect(() => {
    let cancelled = false;

    const fetchMissingActiveEmail = async () => {
      if (!open || !accountId || !folderId) {
        return;
      }

      if (activeZohoNavigation.kind === "thread" && activeZohoNavigation.threadId) {
        setFetchingThreadId(activeZohoNavigation.threadId);
        setFetchingActiveEmailId(null);
        setActiveEmailFetchError(null);

        try {
          const apiThreadId = String(activeZohoNavigation.threadId).replace(/^t/i, "");
          const threadResp = await window.electron.fetchEmails(accountId, {
            folderId,
            threadId: apiThreadId,
            threadedMails: true,
            limit: 100,
          });

          if (cancelled) return;

          const threadEmails: ZohoEmail[] = Array.isArray(threadResp?.data)
            ? threadResp.data.map((email: ZohoEmail) => ({ ...email, accountId: email.accountId || accountId }))
            : [];

          if (!threadEmails.length) {
            setFetchedActiveEmail(null);
            setActiveEmailFetchError(`No emails found for thread ${activeZohoNavigation.threadId}`);
            return;
          }

          const latestEmail = [...threadEmails].sort((a, b) => {
            const aTime = Number(a.receivedTime || a.sentDateInGMT || 0);
            const bTime = Number(b.receivedTime || b.sentDateInGMT || 0);
            return bTime - aTime;
          })[0];

          setActiveZohoNavigation((current) =>
            current.threadId === activeZohoNavigation.threadId
              ? { ...current, messageId: String(latestEmail.messageId) }
              : current
          );

          setFetchedActiveEmail(latestEmail);
          return;
        } catch (error) {
          if (cancelled) return;
          setFetchedActiveEmail(null);
          setActiveEmailFetchError(error instanceof Error ? error.message : String(error));
          return;
        } finally {
          if (!cancelled) {
            setFetchingThreadId((current) =>
              current === activeZohoNavigation.threadId ? null : current
            );
          }
        }
      }

      if (!activeZohoMailId || listActiveEmail) {
        if (!activeZohoMailId || listActiveEmail) {
          setFetchedActiveEmail(null);
          setFetchingActiveEmailId(null);
          setActiveEmailFetchError(null);
        }
        return;
      }

      setFetchingActiveEmailId(activeZohoMailId);
      setActiveEmailFetchError(null);

      try {
        const result = await window.electron.fetchEmailDetails(accountId, folderId, activeZohoMailId);
        const data = result?.data ?? result;
        if (cancelled) return;

        const normalizedEmail: ZohoEmail = {
          accountId: String(data?.accountId ?? accountId),
          summary: String(data?.summary ?? ""),
          sentDateInGMT: String(data?.sentDateInGMT ?? data?.sentDate ?? data?.receivedTime ?? ""),
          calendarType: Number(data?.calendarType ?? 0),
          subject: String(data?.subject ?? ""),
          messageId: String(data?.messageId ?? activeZohoMailId),
          flagid: String(data?.flagid ?? ""),
          status2: String(data?.status2 ?? data?.status ?? ""),
          priority: String(data?.priority ?? ""),
          hasInline: String(data?.hasInline ?? "false"),
          toAddress: String(data?.toAddress ?? data?.to ?? ""),
          folderId: String(data?.folderId ?? folderId),
          ccAddress: String(data?.ccAddress ?? data?.cc ?? ""),
          hasAttachment: String(data?.hasAttachment ?? "0"),
          size: String(data?.size ?? "0"),
          sender: String(data?.sender ?? data?.fromAddress ?? ""),
          receivedTime: String(data?.receivedTime ?? data?.sentDateInGMT ?? ""),
          fromAddress: String(data?.fromAddress ?? data?.sender ?? ""),
          status: String(data?.status ?? "")
        };

        setFetchedActiveEmail(normalizedEmail);
      } catch (error) {
        if (cancelled) return;
        setFetchedActiveEmail(null);
        setActiveEmailFetchError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setFetchingActiveEmailId((current) =>
            current === activeZohoMailId ? null : current
          );
        }
      }
    };

    void fetchMissingActiveEmail();

    return () => {
      cancelled = true;
    };
  }, [open, activeZohoMailId, activeZohoNavigation.kind, activeZohoNavigation.threadId, listActiveEmail, accountId, folderId]);

  const activeConversationId = activeEmail ? findConversationIdForEmail(activeEmail) : null;
  const activeIsProcessed = activeEmail ? isEmailProcessed(activeEmail) : false;

  const handleZohoMailIdChange = (navigation: ZohoMailNavigation) => {
    setActiveZohoNavigation(navigation);
    setActiveZohoUrl(navigation.url);
    const resolvedMessageId = navigation.messageId ?? null;
    if (!resolvedMessageId) return;
    const matched = emails.find((e) => String(e.messageId) === String(resolvedMessageId));
    if (matched && matched.messageId !== selectedEmail?.messageId) {
      void handleSelectEmail(matched);
    }
  };

  const activeMessageId = activeEmail ? String(activeEmail.messageId) : null;
  const isFetchingThread = Boolean(
    activeZohoNavigation.threadId && String(fetchingThreadId) === String(activeZohoNavigation.threadId)
  );
  const isFetchingActiveEmail = Boolean(
    activeZohoMailId && String(fetchingActiveEmailId) === String(activeZohoMailId)
  );
  const isProcessing = Boolean(activeMessageId && String(processingEmailId) === activeMessageId);
  const isAwaitingConversation = Boolean(
    activeMessageId && String(awaitingConversationEmailId) === activeMessageId
  );
  const hasSendError = Boolean(activeMessageId && String(errorEmailId) === activeMessageId);
  const isSendBusy = isFetchingThread || isFetchingActiveEmail || isProcessing || isAwaitingConversation;

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
    if (isFetchingThread) return "Fetching thread...";
    if (isFetchingActiveEmail) return "Fetching email...";
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
                className={`rounded-lg px-3 py-1.5 text-xs font-medium min-w-[140px] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 disabled:hover:bg-slate-100 ${sendButtonClass}`}
                title={
                  isFetchingActiveEmail
                    ? "Fetching current email details from Zoho..."
                    : isFetchingThread
                    ? "Fetching latest email from this Zoho thread..."
                    : !selectedAgentId
                    ? "Pick an agent first"
                    : activeEmail
                    ? `Send "${activeEmail.subject || activeEmail.messageId}" to agent`
                    : "Open an email inside Zoho first"
                }
              >
                <span className="flex items-center justify-center gap-1">
                  {(isFetchingThread || isFetchingActiveEmail || isProcessing || isAwaitingConversation) && (
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
                className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:hover:bg-slate-100"
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
              emailUrl={activeZohoUrl}
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
