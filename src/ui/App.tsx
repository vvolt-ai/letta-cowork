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
import { WorkspaceLayout } from "./components/layout/WorkspaceLayout";
import { ChatWorkspace } from "./components/chat/ChatWorkspace";
import { ActivityPanel } from "./components/activity/ActivityPanel";
import { GlobalErrorToast } from "./components/GlobalErrorToast";
import { EmailDetailsDialog } from "./components/EmailDetailsDialog";
import { CoworkSettingsDialog } from "./components/CoworkSettingsDialog";
import { MemoryDialog } from "./components/MemoryDialog";
import { ChangeEnv } from "./components/ChangeEnv";
import { LoginScreen } from "./components/LoginScreen";
import { useSessionController } from "./hooks/useSessionController";
import { useCoworkSettings } from "./hooks/useCoworkSettings";
import { useAutoSyncUnread } from "./hooks/useAutoSyncUnread";
import { useProcessEmailToAgent } from "./hooks/useProcessEmailToAgent";
import { useAuth } from "./hooks/useAuth";

const SCROLL_THRESHOLD = 50;
const SESSION_CHANGE_SCROLL_DELAY_MS = 100;
const AUTO_SYNC_ENABLED_KEY = "auto_sync_unread_enabled";
const SIDEBAR_WIDTH_STORAGE_KEY = "sidebar_width_px";
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;

const clampSidebarWidth = (value: number) => Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));

const isNearBottom = (container: HTMLDivElement) => {
  const { scrollTop, scrollHeight, clientHeight } = container;
  return scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;
};
const AUTO_SYNC_AGENT_IDS_KEY = "auto_sync_selected_agent_ids";
const AUTO_SYNC_ROUTING_RULES_KEY = "auto_sync_routing_rules";
const AUTO_SYNC_SINCE_DATE_KEY = "auto_sync_since_date";

type AutoSyncRoutingRule = {
  fromPattern: string;
  agentId: string;
};

const DEFAULT_AUTO_SYNC_CONFIG = {
  enabled: false,
  agentIds: [],
  routingRules: [],
  sinceDate: "",
  processingMode: "unread_only",
  markAsReadAfterProcess: true,
} satisfies AutoSyncUnreadConfig;

const hasCustomAutoSyncConfig = (config: AutoSyncUnreadConfig): boolean => {
  return config.enabled
    || config.agentIds.length > 0
    || config.routingRules.length > 0
    || config.sinceDate.length > 0;
};

const readLegacyAutoSyncConfig = (): AutoSyncUnreadConfig => {
  const enabled = localStorage.getItem(AUTO_SYNC_ENABLED_KEY) === "true";

  let agentIds: string[] = [];
  try {
    const raw = localStorage.getItem(AUTO_SYNC_AGENT_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        agentIds = parsed.filter((id) => typeof id === "string" && id.trim().length > 0);
      }
    }
  } catch {
    agentIds = [];
  }

  let routingRules: AutoSyncRoutingRule[] = [];
  try {
    const raw = localStorage.getItem(AUTO_SYNC_ROUTING_RULES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AutoSyncRoutingRule[];
      if (Array.isArray(parsed)) {
        routingRules = parsed.filter(
          (rule) =>
            typeof rule?.fromPattern === "string"
            && rule.fromPattern.trim().length > 0
            && typeof rule?.agentId === "string"
            && rule.agentId.trim().length > 0
        );
      }
    }
  } catch {
    routingRules = [];
  }

  return {
    enabled,
    agentIds,
    routingRules,
    sinceDate: localStorage.getItem(AUTO_SYNC_SINCE_DATE_KEY) ?? "",
    processingMode: "unread_only",
    markAsReadAfterProcess: true,
  };
};

const clearLegacyAutoSyncConfig = () => {
  localStorage.removeItem(AUTO_SYNC_ENABLED_KEY);
  localStorage.removeItem(AUTO_SYNC_AGENT_IDS_KEY);
  localStorage.removeItem(AUTO_SYNC_ROUTING_RULES_KEY);
  localStorage.removeItem(AUTO_SYNC_SINCE_DATE_KEY);
};

function App() {
  // Authentication
  const { isAuthenticated, isLoading: isAuthLoading, checkAuth, user, logout, handleAuthError } = useAuth();

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const pendingHistoryLoadRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");

  // Local UI state
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [lettaEnvOpen, setLettaEnvOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SIDEBAR_WIDTH;
    }
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) ? clampSidebarWidth(stored) : DEFAULT_SIDEBAR_WIDTH;
  });
  const [autoSyncConfigLoaded, setAutoSyncConfigLoaded] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(DEFAULT_AUTO_SYNC_CONFIG.enabled);
  const [autoSyncAgentIds, setAutoSyncAgentIds] = useState<string[]>(DEFAULT_AUTO_SYNC_CONFIG.agentIds);
  const [autoSyncRoutingRules, setAutoSyncRoutingRules] = useState<AutoSyncRoutingRule[]>(DEFAULT_AUTO_SYNC_CONFIG.routingRules);
  const [autoSyncSinceDate, setAutoSyncSinceDate] = useState<string>(DEFAULT_AUTO_SYNC_CONFIG.sinceDate);
  const [autoSyncProcessingMode, setAutoSyncProcessingMode] = useState<AutoSyncProcessingMode>(DEFAULT_AUTO_SYNC_CONFIG.processingMode);
  const [autoSyncMarkAsRead, setAutoSyncMarkAsRead] = useState<boolean>(DEFAULT_AUTO_SYNC_CONFIG.markAsReadAfterProcess);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const { coworkSettings, showCoworkSettings, setShowCoworkSettings, updateCoworkSettings } = useCoworkSettings();

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
    fetchMoreEmails,
    hasMoreEmails,
    isLoadingMoreEmails,
  } = useZohoEmail();

  // State to track newly created conversations for email modal
  const [newlyCreatedConversations, setNewlyCreatedConversations] = useState<Map<string, { conversationId: string; agentId?: string }>>(new Map());

  // Debug: log when state changes
  useEffect(() => {
    console.log(`[App] newlyCreatedConversations updated, size: ${newlyCreatedConversations.size}`);
    newlyCreatedConversations.forEach((value, key) => {
      console.log(`[App]   - ${key}: ${value.conversationId}`);
    });
  }, [newlyCreatedConversations]);

  const { processEmailToAgent, processingEmailId, successEmailId } = useProcessEmailToAgent(
    useCallback((messageId: string, conversationId: string, agentId?: string) => {
      console.log(`[App] Conversation created callback for email ${messageId}: ${conversationId}`);
      setNewlyCreatedConversations(prev => {
        const newMap = new Map(prev);
        newMap.set(messageId, { conversationId, agentId });
        console.log(`[App] Updated newlyCreatedConversations, new size: ${newMap.size}`);
        return newMap;
      });
    }, [])
  );

  const { setEmailAsInput, isLoading: isProcessingEmailInput } = useEmailAsInput();
  const {
    isEmailDetailsOpen,
    isEmailDetailsLoading,
    emailDetailsError,
    viewingEmail,
    emailDetails,
    setIsEmailDetailsOpen,
    handleViewEmail: _handleViewEmail,
  } = useEmailSelection({
    fetchEmailById: loadEmailById,
    markMessagesAsRead,
    refreshEmailsForFolder,
  });
  const emails = zohoEmailsResponse?.data ?? [];
  const selectedAutoSyncAgentIds = useMemo(() => autoSyncAgentIds, [autoSyncAgentIds]);

  // Handler for loading more emails
  const handleLoadMoreEmails = useCallback(() => {
    if (folderId && hasMoreEmails && !isLoadingMoreEmails) {
      fetchMoreEmails(folderId);
    }
  }, [folderId, hasMoreEmails, isLoadingMoreEmails, fetchMoreEmails]);

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
    handleDeleteSession,
    handlePermissionResult,
    isLettaEnvConfigured,
    handleStartSessionClick,
    handleStartWithAgent,
  } = useSessionController({ connected, sendEvent });
  
  // Message window hook - must be called after useSessionController to get activeSessionId
  const scheduleScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    scrollBehaviorRef.current = behavior;

    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current);
    }

    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = scrollContainerRef.current;
      const currentBehavior = scrollBehaviorRef.current;

      if (container) {
        try {
          if (typeof container.scrollTo === "function") {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: currentBehavior,
            });
          } else {
            container.scrollTop = container.scrollHeight;
          }
        } catch {
          container.scrollTop = container.scrollHeight;
        }
      }

      const endNode = messagesEndRef.current;
      if (endNode) {
        try {
          endNode.scrollIntoView({ behavior: currentBehavior });
        } catch {
          endNode.scrollIntoView();
        }
      }
    });
  }, []);

  const {
    visibleMessages,
    hasMoreHistory,
    partialMessage,
    showPartialMessage,
    partialReasoning,
    handlePartialMessages,
    loadMoreHistory,
  } = useMessageWindow(
    messages,
    activeSessionId,
    messagesEndRef,
    shouldAutoScroll,
    () => setHasNewMessages(true),
    scheduleScrollToBottom
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
  const handleStartWithAgentAndStart = useCallback(async (agentId: string, model?: string) => {
    await handleStartWithAgent(agentId, model);
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
    const loadAutoSyncConfig = async () => {
      try {
        const storedConfig = await window.electron.getAutoSyncUnreadConfig();
        const legacyConfig = readLegacyAutoSyncConfig();
        const nextConfig = hasCustomAutoSyncConfig(storedConfig) || !hasCustomAutoSyncConfig(legacyConfig)
          ? storedConfig
          : legacyConfig;

        if (!hasCustomAutoSyncConfig(storedConfig) && hasCustomAutoSyncConfig(legacyConfig)) {
          await window.electron.updateAutoSyncUnreadConfig(legacyConfig);
        }

        setAutoSyncEnabled(nextConfig.enabled);
        setAutoSyncAgentIds(nextConfig.agentIds);
        setAutoSyncRoutingRules(nextConfig.routingRules);
        setAutoSyncSinceDate(nextConfig.sinceDate);
        setAutoSyncProcessingMode(nextConfig.processingMode);
        setAutoSyncMarkAsRead(nextConfig.markAsReadAfterProcess ?? true);
        clearLegacyAutoSyncConfig();
      } catch (err) {
        console.error("Failed to load auto-sync unread config:", err);
        const legacyConfig = readLegacyAutoSyncConfig();
        setAutoSyncEnabled(legacyConfig.enabled);
        setAutoSyncAgentIds(legacyConfig.agentIds);
        setAutoSyncRoutingRules(legacyConfig.routingRules);
        setAutoSyncSinceDate(legacyConfig.sinceDate);
        setAutoSyncProcessingMode(legacyConfig.processingMode);
        setAutoSyncMarkAsRead(legacyConfig.markAsReadAfterProcess ?? true);
      } finally {
        setAutoSyncConfigLoaded(true);
      }
    };

    void loadAutoSyncConfig();
  }, [isAuthenticated]); // Reload config when authentication state changes

  // Listen for auth-expired event from main process
  useEffect(() => {
    const unsubscribe = window.electron.onAuthExpired(() => {
      console.log('[App] Auth expired event received, logging out');
      logout();
    });
    return unsubscribe;
  }, [logout]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    if (!autoSyncConfigLoaded) return;

    const persistAutoSyncConfig = async () => {
      try {
        await window.electron.updateAutoSyncUnreadConfig({
          enabled: autoSyncEnabled,
          agentIds: selectedAutoSyncAgentIds,
          routingRules: autoSyncRoutingRules,
          sinceDate: autoSyncSinceDate,
          processingMode: autoSyncProcessingMode,
          markAsReadAfterProcess: autoSyncMarkAsRead,
        });
      } catch (err) {
        console.error("Failed to persist auto-sync unread config:", err);
      }
    };

    void persistAutoSyncConfig();
  }, [autoSyncConfigLoaded, autoSyncEnabled, autoSyncProcessingMode, autoSyncRoutingRules, autoSyncSinceDate, selectedAutoSyncAgentIds, autoSyncMarkAsRead]);

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

  const { runAutoSyncNow } = useAutoSyncUnread(
    sendEvent,
    accountId,
    folderId,
    selectedAutoSyncAgentIds,
    autoSyncRoutingRules,
    autoSyncEnabled,
    1,
    autoSyncSinceDate,
    autoSyncProcessingMode,
    autoSyncMarkAsRead
  );

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const atBottom = isNearBottom(container);

    if (atBottom !== shouldAutoScroll) {
      setShouldAutoScroll(atBottom);
      if (atBottom) {
        setHasNewMessages(false);
      }
    }
  }, [shouldAutoScroll]);

  const handleLoadMoreHistory = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || !hasMoreHistory) {
      return;
    }

    pendingHistoryLoadRef.current = {
      prevScrollHeight: container.scrollHeight,
      prevScrollTop: container.scrollTop,
    };

    loadMoreHistory();
  }, [hasMoreHistory, loadMoreHistory]);

  const handleToggleActivityPanel = useCallback(() => {
    setIsActivityOpen((prev) => !prev);
  }, []);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    setSidebarWidth((prev) => {
      const clamped = clampSidebarWidth(nextWidth);
      return clamped === prev ? prev : clamped;
    });
  }, []);

  // Reset scroll behavior on session switch
  useEffect(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    prevMessagesLengthRef.current = 0;
    const timer = window.setTimeout(() => {
      scheduleScrollToBottom("auto");
    }, SESSION_CHANGE_SCROLL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, scheduleScrollToBottom]);

  useEffect(() => {
    if (!scrollContainerRef.current) {
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    const container = scrollContainerRef.current;

    if (pendingHistoryLoadRef.current) {
      const { prevScrollHeight, prevScrollTop } = pendingHistoryLoadRef.current;
      const heightDelta = container.scrollHeight - prevScrollHeight;
      container.scrollTop = Math.max(prevScrollTop + heightDelta, 0);
      pendingHistoryLoadRef.current = null;
    } else if (shouldAutoScroll) {
      scheduleScrollToBottom("auto");
    } else if (messages.length > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0) {
      setHasNewMessages(true);
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, scheduleScrollToBottom, shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    scheduleScrollToBottom("smooth");
  }, [scheduleScrollToBottom]);

  const handleSendMessage = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    scheduleScrollToBottom("smooth");
  }, [scheduleScrollToBottom]);

  const agentStatus = activeSession?.ephemeral.status ?? "idle";
  const ephemeralState = activeSession?.ephemeral;
  const reasoningSteps = ephemeralState?.reasoning ?? [];
  const toolExecutions = ephemeralState?.tools ?? [];

  // Show loading while checking auth
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle className="opacity-25" cx="12" cy="12" r="10" />
            <path className="opacity-75" d="M4 12a8 8 0 018-8" />
          </svg>
          <p className="text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={checkAuth} />;
  }

  return (
    <>
      <WorkspaceLayout
        sidebarWidth={sidebarWidth}
        minSidebarWidth={MIN_SIDEBAR_WIDTH}
        maxSidebarWidth={MAX_SIDEBAR_WIDTH}
        onSidebarWidthChange={handleSidebarWidthChange}
        sidebar={
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
            autoSyncSinceDate={autoSyncSinceDate}
            onSetAutoSyncSinceDate={setAutoSyncSinceDate}
            autoSyncProcessingMode={autoSyncProcessingMode}
            onSetAutoSyncProcessingMode={setAutoSyncProcessingMode}
            autoSyncMarkAsRead={autoSyncMarkAsRead}
            onSetAutoSyncMarkAsRead={setAutoSyncMarkAsRead}
            autoSyncAccountId={accountId}
            autoSyncFolderId={folderId}
            onRunAutoSyncNow={runAutoSyncNow}
            onRefreshEmailMailbox={refetchEmails}
            selectedAgentId={selectedAutoSyncAgentIds[0]}
            onProcessEmailToAgent={processEmailToAgent}
            processingEmailId={processingEmailId}
            successEmailId={successEmailId}
            newlyCreatedConversations={newlyCreatedConversations}
            onOpenSettings={() => setShowCoworkSettings(true)}
            hasMoreEmails={hasMoreEmails}
            isLoadingMoreEmails={isLoadingMoreEmails}
            onLoadMoreEmails={handleLoadMoreEmails}
            userEmail={user?.email}
            onLogout={logout}
          />
        }
        chat={
          <ChatWorkspace
            title={activeSession?.title}
            agentName={activeSession?.agentName}
            agentId={activeSession?.agentId}
            activeSessionId={activeSessionId}
            visibleMessages={visibleMessages}
            hasNewMessages={hasNewMessages}
            shouldAutoScroll={shouldAutoScroll}
            agentStatus={agentStatus}
            partialMessage={partialMessage}
            showPartialMessage={showPartialMessage}
            partialReasoning={partialReasoning}
            isHistoryLoading={Boolean(activeSession?.isLoadingHistory)}
            hasMoreHistory={hasMoreHistory || Boolean(activeSession?.totalDisplayableCount && activeSession.totalDisplayableCount > visibleMessages.length)}
            reasoningSteps={reasoningSteps}
            toolExecutions={toolExecutions}
            cliResults={ephemeralState?.cliResults ?? []}
            onScroll={handleScroll}
            onScrollToBottom={scrollToBottom}
            onSendMessage={handleSendMessage}
            onLoadMoreHistory={handleLoadMoreHistory}
            sendEvent={sendEvent}
            scrollContainerRef={scrollContainerRef}
            messagesEndRef={messagesEndRef}
            activityOpen={isActivityOpen}
            onToggleActivity={handleToggleActivityPanel}
            onOpenMemory={() => setIsMemoryOpen(true)}
          />
        }
        activity={
          isActivityOpen ? (
            <ActivityPanel
              status={agentStatus}
              ephemeral={ephemeralState}
              permissionRequests={permissionRequests}
              coworkSettings={coworkSettings}
              isEmailConnected={isMailConnected}
              onPermissionResult={handlePermissionResult}
            />
          ) : null
        }
      />

      {pendingStart ? (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-ink-900/20 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink-900/10 bg-surface px-6 py-5 shadow-elevated">
            <svg className="h-6 w-6 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle className="opacity-20" cx="12" cy="12" r="10" />
              <path d="M4 12a8 8 0 018-8" />
            </svg>
            <div className="text-sm font-medium text-ink-800">Starting session…</div>
            <p className="text-xs text-muted text-center max-w-xs">Hang tight while we spin up your agent and connect the workspace.</p>
          </div>
        </div>
      ) : null}

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

      {globalError && (
        <GlobalErrorToast message={globalError} onClose={() => setGlobalError(null)} />
      )}
      <ChangeEnv open={lettaEnvOpen} onOpenChange={setLettaEnvOpen} className="hidden" />
      <CoworkSettingsDialog
        open={showCoworkSettings}
        onOpenChange={setShowCoworkSettings}
        onAuthError={handleAuthError}
      />
      <MemoryDialog open={isMemoryOpen} onOpenChange={setIsMemoryOpen} />
      <EmailDetailsDialog
        open={isEmailDetailsOpen}
        onOpenChange={setIsEmailDetailsOpen}
        email={viewingEmail}
        details={emailDetails}
        loading={isEmailDetailsLoading}
        error={emailDetailsError}
      />
    </>
  );
}

export default App;
