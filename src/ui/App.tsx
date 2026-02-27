import { useCallback, useEffect, useRef, useState } from "react";
import { useIPC } from "./hooks/useIPC";
import { useMessageWindow } from "./hooks/useMessageWindow";
import { useAppStore } from "./store/useAppStore";
import type { ServerEvent } from "./types";
import { Sidebar } from "./components/Sidebar";
import { StartSessionModal } from "./components/StartSessionModal";
import { usePromptActions } from "./components/PromptInput";
import { useZohoEmail } from "./hooks/useZohoEmail";
import { useEmailAsInput } from "./hooks/useEmailAsInput";
import { useEmailSelection } from "./hooks/useEmailSelection";
import { ChatMainPanel } from "./components/ChatMainPanel";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { EmailDetailsDialog } from "./components/EmailDetailsDialog";
import { useSessionController } from "./hooks/useSessionController";

const SCROLL_THRESHOLD = 50;
const PARTIAL_MESSAGE_RESET_DELAY_MS = 500;
const SESSION_CHANGE_SCROLL_DELAY_MS = 100;

type StreamEventMessage = {
  type: "stream_event";
  event: { type: string; delta?: { text?: string; reasoning?: string } };
};

function App() {
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const partialMessageRef = useRef("");
  const prevMessagesLengthRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  // Local UI state
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);

  // Email APIs
  const {
    emails: zohoEmailsResponse,
    fetchEmailById: loadEmailById,
    markMessagesAsRead,
    isMailConnected,
    isFetchingEmailContent,
    refetchEmails,
    refreshEmailsForFolder,
    connectEmail,
    disconnectEmail,
  } = useZohoEmail();
  const { setEmailAsInput } = useEmailAsInput();
  const {
    selectedEmailId,
    handleSelectEmail,
    isEmailDetailsOpen,
    isEmailDetailsLoading,
    emailDetailsError,
    viewingEmail,
    emailDetails,
    setIsEmailDetailsOpen,
    handleViewEmail,
  } = useEmailSelection({
    fetchEmailById: loadEmailById,
    markMessagesAsRead,
    refreshEmailsForFolder,
  });
  const emails = zohoEmailsResponse?.data ?? [];

  // Handle partial streaming tokens for assistant responses
  const handlePartialMessages = useCallback((partialEvent: ServerEvent) => {
    if (partialEvent.type !== "stream.message" || partialEvent.payload.message.type !== "stream_event") return;

    const message = partialEvent.payload.message as StreamEventMessage;
    const event = message.event;

    if (event.type === "content_block_start") {
      partialMessageRef.current = "";
      setPartialMessage(partialMessageRef.current);
      setShowPartialMessage(true);
    }

    if (event.type === "content_block_delta" && event.delta) {
      const text = event.delta.text || event.delta.reasoning || "";
      partialMessageRef.current += text;
      setPartialMessage(partialMessageRef.current);
      if (shouldAutoScroll) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } else {
        setHasNewMessages(true);
      }
    }

    if (event.type === "content_block_stop") {
      setShowPartialMessage(false);
      setTimeout(() => {
        partialMessageRef.current = "";
        setPartialMessage(partialMessageRef.current);
      }, PARTIAL_MESSAGE_RESET_DELAY_MS);
    }
  }, [shouldAutoScroll]);

  // Unified event handler from IPC stream
  const onEvent = useCallback((event: ServerEvent) => {
    handleServerEvent(event);
    handlePartialMessages(event);
  }, [handleServerEvent, handlePartialMessages]);

  const { connected, sendEvent } = useIPC(onEvent);
  const {
    activeSessionId,
    showStartModal,
    setShowStartModal,
    globalError,
    setGlobalError,
    prompt,
    setPrompt,
    cwd,
    setCwd,
    pendingStart,
    activeSession,
    messages,
    permissionRequests,
    isRunning,
    handleNewSession,
    handleDeleteSession,
    handlePermissionResult,
  } = useSessionController({ connected, sendEvent });
  const { handleStartFromModal } = usePromptActions(sendEvent);

  const {
    visibleMessages,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    resetToLatest,
    totalMessages,
  } = useMessageWindow(messages, permissionRequests, activeSessionId);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isAtBottom !== shouldAutoScroll) {
      setShouldAutoScroll(isAtBottom);
      if (isAtBottom) {
        setHasNewMessages(false);
      }
    }
  }, [shouldAutoScroll]);

  // Top sentinel triggers incremental history load
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
          scrollHeightBeforeLoadRef.current = container.scrollHeight;
          shouldRestoreScrollRef.current = true;
          loadMoreMessages();
        }
      },
      {
        root: container,
        rootMargin: "100px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMoreHistory, isLoadingHistory, loadMoreMessages]);

  // Keep viewport stable when prepending old history
  useEffect(() => {
    if (shouldRestoreScrollRef.current && !isLoadingHistory) {
      const container = scrollContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
        container.scrollTop += scrollDiff;
      }
      shouldRestoreScrollRef.current = false;
    }
  }, [visibleMessages, isLoadingHistory]);

  // Reset scroll behavior on session switch
  useEffect(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    prevMessagesLengthRef.current = 0;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, SESSION_CHANGE_SCROLL_DELAY_MS);
  }, [activeSessionId]);

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0) {
      setHasNewMessages(true);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, partialMessage, shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [resetToLatest]);

  const handleSendMessage = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    resetToLatest();
  }, [resetToLatest]);

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        connected={connected}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onConnectEmail={connectEmail}
        onDisconnectEmail={disconnectEmail}
        isEmailConnected={isMailConnected}
        refetchEmails={refetchEmails}
        emails={emails}
        selectedEmailId={selectedEmailId}
        onSelectEmail={handleSelectEmail}
        onViewEmail={handleViewEmail}
        onUseEmailAsInput={setEmailAsInput}
        isFetchingEmails={isFetchingEmailContent}
      />
      <ChatMainPanel
        title={activeSession?.title}
        activeSessionId={activeSessionId}
        isRunning={isRunning}
        permissionRequests={permissionRequests}
        visibleMessages={visibleMessages}
        hasMoreHistory={hasMoreHistory}
        totalMessages={totalMessages}
        isLoadingHistory={isLoadingHistory}
        partialMessage={partialMessage}
        showPartialMessage={showPartialMessage}
        hasNewMessages={hasNewMessages}
        shouldAutoScroll={shouldAutoScroll}
        onPermissionResult={handlePermissionResult}
        onScroll={handleScroll}
        onScrollToBottom={scrollToBottom}
        onSendMessage={handleSendMessage}
        sendEvent={sendEvent}
        scrollContainerRef={scrollContainerRef}
        topSentinelRef={topSentinelRef}
        messagesEndRef={messagesEndRef}
      />
      {showStartModal && (
        <StartSessionModal
          cwd={cwd}
          prompt={prompt}
          pendingStart={pendingStart}
          onCwdChange={setCwd}
          onPromptChange={setPrompt}
          onStart={handleStartFromModal}
          onClose={() => setShowStartModal(false)}
        />
      )}

      {globalError && <GlobalErrorToast message={globalError} onClose={() => setGlobalError(null)} />}
      <EmailDetailsDialog
        open={isEmailDetailsOpen}
        onOpenChange={setIsEmailDetailsOpen}
        email={viewingEmail}
        details={emailDetails}
        loading={isEmailDetailsLoading}
        error={emailDetailsError}
      />
    </div>
  );
}

export default App;
