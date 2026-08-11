import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";

import { useEmailInbox } from "./hooks/useEmailInbox";
import { SendToAgentConfirmationModal } from "./SendToAgentConfirmationModal";
import { ZohoMailEmbed, type ZohoMailNavigation } from "./ZohoMailEmbed";
import { ConversationViewer } from "../../../chat/components/ConversationViewer";

import type { ZohoEmail } from "../../../../types";
import type { EmailInboxModalProps } from "../../types";

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
  isServerConnected = true,
  isEmailConnected = true,
  isFetching,
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

  // Reset active id when the modal closes
  useEffect(() => {
    if (!open) {
      setActiveZohoNavigation({ kind: "none", rawId: null, url: "" });
      setActiveZohoUrl("");
      setFetchedActiveEmail(null);
      setFetchingActiveEmailId(null);
      setFetchingThreadId(null);
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
        }
        return;
      }

      setFetchingActiveEmailId(activeZohoMailId);

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

  const canSendToAgent = Boolean(isServerConnected && isEmailConnected && activeEmail) && !isSendBusy;
  const canViewConversation = Boolean(activeConversationId);

  const sendDisabledReason = (() => {
    if (hasSendError) return null;
    if (!isServerConnected) return "Cowork server is disconnected. Reconnect Cowork first.";
    if (!isEmailConnected) return "Email is not connected. Connect Zoho Mail first.";
    if (isFetching) return "Loading mailbox from Zoho.";
    if (isFetchingActiveEmail) return "Fetching the current email from Zoho.";
    if (isFetchingThread) return "Fetching the latest email in this Zoho thread.";
    if (isProcessing) return "This email is already being sent to an agent.";
    if (isAwaitingConversation) return "Waiting for the agent conversation to be created.";
    if (!activeZohoMailId) return "Open an email in Zoho first.";
    if (!activeEmail) return "Still loading details for the open email.";
    return null;
  })();

  const viewConversationDisabledReason = (() => {
    if (canViewConversation) return null;
    if (!isServerConnected) return "Cowork server is disconnected. Reconnect Cowork first.";
    if (!isEmailConnected) return "Email is not connected. Connect Zoho Mail first.";
    if (isFetching) return "Loading mailbox from Zoho.";
    if (isProcessing || isAwaitingConversation) return "Conversation will be available after the agent run starts.";
    if (!activeZohoMailId) return "Open an email in Zoho first.";
    if (!activeEmail) return "Still loading details for the open email.";
    return "No conversation exists for this email yet. Use Send to Agent first.";
  })();

  const [showConfirmSend, setShowConfirmSend] = useState(false);

  const onClickSendToAgent = () => {
    // Agent is now picked inside the modal, so we no longer require a
    // pre-selected one. Just need an email and not be mid-send.
    if (!activeEmail || isSendBusy) return;
    setShowConfirmSend(true);
  };

  const onConfirmSend = (agentId: string, additionalInstructions?: string) => {
    if (!activeEmail || !agentId) return;
    void handleProcessEmailToAgent(activeEmail, agentId, additionalInstructions);
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
        <Dialog.Content className="fixed inset-2 z-50 flex h-[calc(100vh-16px)] w-[calc(100vw-16px)] flex-col overflow-hidden rounded-3xl border border-white/70 bg-[var(--color-bg-000)] shadow-2xl outline-none">
          {/* Header */}
          <div className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg></span>
              <div><Dialog.Title className="text-sm font-semibold tracking-tight text-ink-900">Emails</Dialog.Title><p className="mt-0.5 text-[10px] text-muted">Connected Zoho inbox</p></div>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="inline-flex h-8 items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 text-[11px] font-semibold text-ink-600 transition hover:bg-[var(--color-surface-secondary)]"
                  title="Refresh emails"
                >
                  ↻ Refresh
                </button>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={onClickSendToAgent}
                  disabled={!canSendToAgent && !hasSendError}
                  className={`min-w-[140px] rounded-xl px-3 py-2 text-[11px] font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:border disabled:border-[var(--color-border)] disabled:bg-[var(--color-surface-secondary)] disabled:text-muted ${sendButtonClass}`}
                  title={sendDisabledReason || (activeEmail ? `Send "${activeEmail.subject || activeEmail.messageId}" to agent` : "Send this email to an agent")}
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
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 py-2 text-[11px] font-semibold text-ink-600 transition hover:bg-[var(--color-surface-secondary)] hover:text-ink-900 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-secondary)] disabled:text-muted"
                  title={viewConversationDisabledReason || "View conversation for this email"}
                >
                  View Conversation
                </button>
              </div>
              {(sendDisabledReason || viewConversationDisabledReason) && (
                <p className="max-w-[520px] text-right text-[11px] leading-4 text-slate-500">
                  {sendDisabledReason ? <span><strong>Send disabled:</strong> {sendDisabledReason}</span> : null}
                  {sendDisabledReason && viewConversationDisabledReason ? <span> · </span> : null}
                  {viewConversationDisabledReason ? <span><strong>View disabled:</strong> {viewConversationDisabledReason}</span> : null}
                </p>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--color-surface-secondary)] hover:text-ink-900" aria-label="Close inbox">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {/* Body: full-bleed Zoho webview */}
          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-white">
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
              defaultAgentId={selectedAgentId}
            />

            {/* Conversation overlay drawer */}
            {viewingConversationId && (
              <div className="absolute inset-y-0 right-0 z-10 flex w-full min-w-0 max-w-[680px] flex-col overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-bg-000)] shadow-2xl">
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
