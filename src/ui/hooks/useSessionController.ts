import { useCallback, useEffect } from "react";
import type { CanUseToolResponse, ClientEvent } from "../types";
import { useAppStore } from "../store/useAppStore";

interface UseSessionControllerArgs {
  connected: boolean;
  sendEvent: (event: ClientEvent) => void;
}

export function useSessionController({ connected, sendEvent }: UseSessionControllerArgs) {
  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const setActiveSessionId = useAppStore((s) => s.setActiveSessionId);
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

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const messages = activeSession?.messages ?? [];
  const permissionRequests = activeSession?.permissionRequests ?? [];
  const isRunning = activeSession?.status === "running";

  useEffect(() => {
    if (connected) {
      sendEvent({ type: "session.list" });
    }
  }, [connected, sendEvent]);

  useEffect(() => {
    if (!activeSessionId || !connected) return;
    const session = sessions[activeSessionId];
    if (session && !session.hydrated && !historyRequested.has(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSessionId, connected, historyRequested, markHistoryRequested, sendEvent, sessions]);

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null);
    setShowStartModal(true);
  }, [setActiveSessionId, setShowStartModal]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const handlePermissionResult = useCallback((toolUseId: string, result: CanUseToolResponse) => {
    if (!activeSessionId) return;
    sendEvent({ type: "permission.response", payload: { sessionId: activeSessionId, toolUseId, result } });
    resolvePermissionRequest(activeSessionId, toolUseId);
  }, [activeSessionId, resolvePermissionRequest, sendEvent]);

  return {
    sessions,
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
  };
}
