import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAutoSyncUnread } from "./hooks/useAutoSyncUnread";
import { useProcessEmailToAgent } from "./hooks/useProcessEmailToAgent";

const SCROLL_THRESHOLD = 50;
const PARTIAL_MESSAGE_RESET_DELAY_MS = 500;
const SESSION_CHANGE_SCROLL_DELAY_MS = 100;
const AUTO_SYNC_ENABLED_KEY = "auto_sync_unread_enabled";
const AUTO_SYNC_AGENT_IDS_KEY = "auto_sync_selected_agent_ids";
const AUTO_SYNC_ROUTING_RULES_KEY = "auto_sync_routing_rules";

type AutoSyncRoutingRule = {
  fromPattern: string;
  agentId: string;
};

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
  const [lettaEnvOpen, setLettaEnvOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === "true";
  });
  const [autoSyncAgentIds, setAutoSyncAgentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(AUTO_SYNC_AGENT_IDS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id.trim().length > 0) : [];
    } catch {
      return [];
    }
  });
  const [autoSyncRoutingRules, setAutoSyncRoutingRules] = useState<AutoSyncRoutingRule[]>(() => {
    try {
      const raw = localStorage.getItem(AUTO_SYNC_ROUTING_RULES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as AutoSyncRoutingRule[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (rule) =>
          typeof rule?.fromPattern === "string" &&
          rule.fromPattern.trim().length > 0 &&
          typeof rule?.agentId === "string" &&
          rule.agentId.trim().length > 0
      );
    } catch {
      return [];
    }
  });
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);

  // Email APIs
  const {
    accountId,
    folderId,
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
  const { processEmailToAgent, processingEmailId, successEmailId } = useProcessEmailToAgent();
  const { setEmailAsInput, isLoading: isProcessingEmailInput } = useEmailAsInput();
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
  const selectedAutoSyncAgentIds = useMemo(() => autoSyncAgentIds, [autoSyncAgentIds]);

  const handleAddAutoSyncAgent = useCallback((agentId: string) => {
    const trimmed = agentId.trim();
    if (!trimmed) return;
    setAutoSyncAgentIds((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }, []);

  const handleRemoveAutoSyncAgent = useCallback((agentId: string) => {
    setAutoSyncAgentIds((prev) => prev.filter((id) => id !== agentId));
  }, []);

  const handleAddAutoSyncRoutingRule = useCallback((fromPattern: string, agentId: string) => {
    const normalizedFrom = fromPattern.trim().toLowerCase();
    const normalizedAgent = agentId.trim();
    if (!normalizedFrom || !normalizedAgent) return;
    setAutoSyncRoutingRules((prev) => {
      const exists = prev.some(
        (rule) =>
          rule.fromPattern.toLowerCase() === normalizedFrom &&
          rule.agentId === normalizedAgent
      );
      if (exists) return prev;
      return [...prev, { fromPattern: normalizedFrom, agentId: normalizedAgent }];
    });
  }, []);

  const handleRemoveAutoSyncRoutingRule = useCallback((index: number) => {
    setAutoSyncRoutingRules((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

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

  // Handle starting session with selected agent - save agent to env first, then start
  const handleStartWithAgent = useCallback(async (agentId: string) => {
    if (agentId) {
      try {
        // Get current env and update only the agent ID
        const currentEnv = await window.electron.getLettaEnv();
        await window.electron.updateLettaEnv({
          ...currentEnv,
          LETTA_AGENT_ID: agentId
        });
      } catch (err) {
        console.error("Failed to update agent in env:", err);
      }
    }
    // Then start the session
    handleStartFromModal();
  }, [handleStartFromModal]);

  const isLettaEnvConfigured = useCallback(async () => {
    try {
      const env = await window.electron.getLettaEnv();
      const baseUrl = env.LETTA_BASE_URL.trim();
      const apiKey = env.LETTA_API_KEY.trim();
      const agentId = env.LETTA_AGENT_ID.trim();
      return baseUrl.length > 0 && apiKey.length > 0 && agentId.length > 0;
    } catch {
      return false;
    }
  }, []);

  const handleStartSessionClick = useCallback(async () => {
    const configured = await isLettaEnvConfigured();
    if (!configured) {
      setShowStartModal(false);
      setLettaEnvOpen(true);
      return;
    }
    handleNewSession();
  }, [handleNewSession, isLettaEnvConfigured, setShowStartModal]);

  useEffect(() => {
    if (!showStartModal) return;
    let cancelled = false;
    isLettaEnvConfigured().then((configured) => {
      if (cancelled || configured) return;
      setShowStartModal(false);
      setLettaEnvOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isLettaEnvConfigured, setShowStartModal, showStartModal]);

  useEffect(() => {
    localStorage.setItem(AUTO_SYNC_ENABLED_KEY, String(autoSyncEnabled));
  }, [autoSyncEnabled]);

  useEffect(() => {
    localStorage.setItem(AUTO_SYNC_AGENT_IDS_KEY, JSON.stringify(selectedAutoSyncAgentIds));
  }, [selectedAutoSyncAgentIds]);

  useEffect(() => {
    localStorage.setItem(AUTO_SYNC_ROUTING_RULES_KEY, JSON.stringify(autoSyncRoutingRules));
  }, [autoSyncRoutingRules]);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useAutoSyncUnread(
    sendEvent,
    accountId,
    folderId,
    selectedAutoSyncAgentIds,
    autoSyncRoutingRules,
    autoSyncEnabled,
    1
  );

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
        onNewSession={handleStartSessionClick}
        lettaEnvOpen={lettaEnvOpen}
        onLettaEnvOpenChange={setLettaEnvOpen}
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
        isProcessingEmailInput={isProcessingEmailInput}
        isFetchingEmails={isFetchingEmailContent}
        autoSyncEnabled={autoSyncEnabled}
        onToggleAutoSync={setAutoSyncEnabled}
        autoSyncAgentIds={selectedAutoSyncAgentIds}
        onAddAutoSyncAgent={handleAddAutoSyncAgent}
        onRemoveAutoSyncAgent={handleRemoveAutoSyncAgent}
        autoSyncRoutingRules={autoSyncRoutingRules}
        onAddAutoSyncRoutingRule={handleAddAutoSyncRoutingRule}
        onRemoveAutoSyncRoutingRule={handleRemoveAutoSyncRoutingRule}
        selectedAgentId={selectedAutoSyncAgentIds[0]}
        onProcessEmailToAgent={processEmailToAgent}
        processingEmailId={processingEmailId}
        successEmailId={successEmailId}
        onCollapsedChange={setSidebarCollapsed}
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
        sidebarCollapsed={sidebarCollapsed}
      />
      {showStartModal && (
        <StartSessionModal
          cwd={cwd}
          prompt={prompt}
          pendingStart={pendingStart}
          onCwdChange={setCwd}
          onPromptChange={setPrompt}
          onStart={handleStartWithAgent}
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
