import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIPC } from "./hooks/useIPC";
import { useMessageWindow } from "./hooks/useMessageWindow";
import { useAppStore } from "./store/useAppStore";
import type { ServerEvent } from "./types";
import { Sidebar } from "./components/Sidebar";
import { StartSessionModal } from "./components/StartSessionModal";
import { useZohoEmail } from "./hooks/useZohoEmail";
import { useEmailAsInput } from "./hooks/useEmailAsInput";
import { useEmailSelection } from "./hooks/useEmailSelection";
import { ChatMainPanel } from "./components/ChatMainPanel";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { EmailDetailsDialog } from "./components/EmailDetailsDialog";
import { CoworkSettingsDialog } from "./components/CoworkSettingsDialog";
import { useSessionController } from "./hooks/useSessionController";
import { useCoworkSettings } from "./hooks/useCoworkSettings";
import { useAutoSyncUnread } from "./hooks/useAutoSyncUnread";
import { useProcessEmailToAgent } from "./hooks/useProcessEmailToAgent";

const SCROLL_THRESHOLD = 50;
const SESSION_CHANGE_SCROLL_DELAY_MS = 100;
const AUTO_SYNC_ENABLED_KEY = "auto_sync_unread_enabled";
const AUTO_SYNC_AGENT_IDS_KEY = "auto_sync_selected_agent_ids";
const AUTO_SYNC_ROUTING_RULES_KEY = "auto_sync_routing_rules";

type AutoSyncRoutingRule = {
  fromPattern: string;
  agentId: string;
};

function App() {
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  // Local UI state
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
  const { showCoworkSettings, setShowCoworkSettings, updateCoworkSettings } = useCoworkSettings();

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

  // Store handlePartialMessages in a ref so it can be used in onEvent before useMessageWindow is called
  const handlePartialMessagesRef = useRef<((event: ServerEvent) => void) | null>(null);

  // Define onEvent early - it will read handlePartialMessages from ref
  const onEvent = useCallback((event: ServerEvent) => {
    handleServerEvent(event);
    if (handlePartialMessagesRef.current) {
      handlePartialMessagesRef.current(event);
    }
  }, [handleServerEvent]);

  const { connected, sendEvent } = useIPC(onEvent);
  
  // Session controller - provides activeSessionId and session management
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
    handleDeleteSession,
    handlePermissionResult,
    isLettaEnvConfigured,
    handleStartSessionClick,
    handleStartWithAgent,
  } = useSessionController({ connected, sendEvent });
  
  // Message window hook - must be called after useSessionController to get activeSessionId
  const {
    visibleMessages,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    resetToLatest,
    totalMessages,
    partialMessage,
    showPartialMessage,
    handlePartialMessages,
  } = useMessageWindow(
    messages, 
    permissionRequests, 
    activeSessionId,
    messagesEndRef,
    shouldAutoScroll,
    () => setHasNewMessages(true)
  );

  // Update the ref with handlePartialMessages after useMessageWindow is called
  useEffect(() => {
    handlePartialMessagesRef.current = handlePartialMessages;
  }, [handlePartialMessages]);

  // Wrapped handleStartSessionClick for Sidebar - calls with setLettaEnvOpen callback
  const handleStartSessionClickWithEnv = useCallback(() => {
    handleStartSessionClick(setLettaEnvOpen);
  }, [handleStartSessionClick, setLettaEnvOpen]);

  // Wrapped handleStartWithAgent for StartSessionModal - just updates env and lets the modal close
  // The session.start event is already sent by handleStartWithAgent
  const handleStartWithAgentAndStart = useCallback(async (agentId: string) => {
    await handleStartWithAgent(agentId);
    // Don't call handleStartFromModal - handleStartWithAgent already sends session.start
    setShowStartModal(false);
  }, [handleStartWithAgent, setShowStartModal]);

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

  // Load cowork settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electron.getCoworkSettings();
        updateCoworkSettings(settings);
      } catch (err) {
        console.error("Failed to load cowork settings:", err);
      }
    };
    loadSettings();
  }, [updateCoworkSettings]);

  useAutoSyncUnread(
    sendEvent,
    accountId,
    folderId,
    selectedAutoSyncAgentIds,
    autoSyncRoutingRules,
    autoSyncEnabled,
    1
  );

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
        onNewSession={handleStartSessionClickWithEnv}
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
        onOpenSettings={() => setShowCoworkSettings(true)}
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
          onStart={handleStartWithAgentAndStart}
          onClose={() => setShowStartModal(false)}
        />
      )}

      {globalError && <GlobalErrorToast message={globalError} onClose={() => setGlobalError(null)} />}
      <CoworkSettingsDialog
        open={showCoworkSettings}
        onOpenChange={setShowCoworkSettings}
      />
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
