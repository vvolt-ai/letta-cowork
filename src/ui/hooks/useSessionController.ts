import { useCallback, useEffect } from "react";
import type { CanUseToolResponse, ClientEvent } from "../types";
import { useAppStore } from "../store/useAppStore";

interface UseSessionControllerArgs {
  connected: boolean;
  sendEvent: (event: ClientEvent) => void;
}

export function useSessionController({ connected, sendEvent }: UseSessionControllerArgs) {
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const activeSession = useAppStore((s) => (activeSessionId ? s.sessions[activeSessionId] : undefined));
  const setActiveSessionId = useAppStore((s) => s.setActiveSessionId);
  const setIPCSendEvent = useAppStore((s) => s.setIPCSendEvent);
  const showStartModal = useAppStore((s) => s.showStartModal);
  const setShowStartModal = useAppStore((s) => s.setShowStartModal);
  const globalError = useAppStore((s) => s.globalError);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const historyRequested = useAppStore((s) => s.historyRequested);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const resolvePermissionRequest = useAppStore((s) => s.resolvePermissionRequest);
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const cwd = useAppStore((s) => s.cwd);
  const setCwd = useAppStore((s) => s.setCwd);
  const pendingStart = useAppStore((s) => s.pendingStart);
  const setPendingStart = useAppStore((s) => s.setPendingStart);

  const messages = activeSession?.messages ?? [];
  const permissionRequests = activeSession?.permissionRequests ?? [];
  const isRunning = activeSession?.status === "running";

  // Initialize IPC send function and load sessions when connected
  useEffect(() => {
    if (connected && sendEvent) {
      setIPCSendEvent(sendEvent);
      // Load stored sessions from electron-store
      sendEvent({ type: "session.list" });
    }
  }, [connected, sendEvent, setIPCSendEvent]);

  useEffect(() => {
    if (!activeSessionId || !connected || !activeSession) return;
    if (!activeSession.hydrated && !historyRequested.has(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSession, activeSessionId, connected, historyRequested, markHistoryRequested, sendEvent]);

  useEffect(() => {
    if (!activeSessionId || !connected || !activeSession?.agentId) return;
    if (activeSession.permissionRequests.length > 0) return;

    void window.electron.recoverPendingApprovals(activeSessionId, activeSession.agentId)
      .catch((error) => {
        console.warn("Failed to recover pending approvals", { activeSessionId, error });
      });
  }, [activeSession?.agentId, activeSession?.permissionRequests.length, activeSessionId, connected]);

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setShowStartModal(true);
  }, [setActiveSessionId, setShowStartModal]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const handlePermissionResult = useCallback((toolUseId: string, result: CanUseToolResponse) => {
    if (!activeSessionId || !activeSession) return;
    // Recovered runs are now auto-approved on resume; this path should rarely be reached.
    // If it does (race condition), let the normal permission response flow handle it.
    sendEvent({ type: "permission.response", payload: { sessionId: activeSessionId, toolUseId, result } });
    resolvePermissionRequest(activeSessionId, toolUseId);
  }, [activeSession, activeSessionId, resolvePermissionRequest, sendEvent, setGlobalError]);

  // Check if Letta environment is configured
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

  // Handle starting session - checks config first
  const handleStartSessionClick = useCallback(async (setLettaEnvOpen?: (open: boolean) => void) => {
    const configured = await isLettaEnvConfigured();
    if (!configured) {
      setShowStartModal(false);
      if (setLettaEnvOpen) {
        setLettaEnvOpen(true);
      }
      return;
    }
    handleNewSession();
  }, [handleNewSession, isLettaEnvConfigured, setShowStartModal]);

  // Handle starting session with a specific agent - updates env first, then starts
  const handleStartWithAgent = useCallback(async (agentId: string, model?: string) => {
    if (agentId) {
      try {
        const currentEnv = await window.electron.getLettaEnv();
        await window.electron.updateLettaEnv({
          ...currentEnv,
          LETTA_AGENT_ID: agentId
        });
      } catch (err) {
        console.error("Failed to update agent in env:", err);
      }
    }
    // Start session with the selected agent
    setPendingStart(true);
    sendEvent({
      type: "session.start",
      payload: { 
        title: "", 
        prompt, 
        cwd: cwd.trim() || undefined, 
        allowedTools: "Read,Edit,Bash",
        model: model || undefined
      }
    });
  }, [cwd, prompt, sendEvent, setPendingStart]);

  return {
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
    isLettaEnvConfigured,
    handleStartSessionClick,
    handleStartWithAgent,
  };
}
