import { useState, useCallback, useEffect, useMemo } from "react";
import type { ProcessedUnreadEmailDebugInfo, ProcessedEmailEntry } from "../../../types";

interface UseMailPipelineOptions {
  open: boolean;
  accountId: string;
  folderId: string;
  autoSyncAgentIds: string[];
  autoSyncRoutingRules: { fromPattern: string; agentId: string }[];
  autoSyncSinceDate: string;
  onSetAutoSyncSinceDate: (date: string) => void;
  onRunAutoSyncNow: () => Promise<void>;
  onRefreshEmailMailbox?: () => void | Promise<unknown>;
}

const getTodayDateInputValue = (): string => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 10);
};

export function useMailPipeline({
  open,
  accountId,
  folderId,
  autoSyncAgentIds,
  autoSyncRoutingRules,
  autoSyncSinceDate,
  onSetAutoSyncSinceDate,
  onRunAutoSyncNow,
  onRefreshEmailMailbox,
}: UseMailPipelineOptions) {
  const [debugInfo, setDebugInfo] = useState<ProcessedUnreadEmailDebugInfo | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"refresh" | "clear" | "reprocess" | null>(null);

  const canInspectMailbox = Boolean(accountId && folderId);
  const recentEntries = useMemo(() => (debugInfo?.entries ?? []) as ProcessedEmailEntry[], [debugInfo]);

  const loadDebugInfo = useCallback(async () => {
    if (!accountId || !folderId) {
      setDebugInfo(null);
      setDebugError(null);
      return;
    }

    setDebugLoading(true);
    setDebugError(null);

    try {
      const info = await window.electron.getProcessedUnreadEmailDebugInfo(accountId, folderId, 10);
      setDebugInfo(info);
    } catch (error) {
      console.error("Failed to load processed unread email debug info:", error);
      setDebugError("Could not load processed unread state for the current mailbox.");
    } finally {
      setDebugLoading(false);
    }
  }, [accountId, folderId]);

  useEffect(() => {
    if (!open) {
      setActionStatus(null);
      setActiveAction(null);
      return;
    }

    if (!autoSyncSinceDate && autoSyncAgentIds.length === 0 && autoSyncRoutingRules.length === 0) {
      onSetAutoSyncSinceDate(getTodayDateInputValue());
    }

    void loadDebugInfo();
  }, [
    autoSyncAgentIds.length,
    autoSyncRoutingRules.length,
    autoSyncSinceDate,
    loadDebugInfo,
    onSetAutoSyncSinceDate,
    open,
  ]);

  const handleRefreshDebugInfo = useCallback(async () => {
    setActiveAction("refresh");
    setActionStatus(null);
    try {
      await loadDebugInfo();
      setActionStatus("Mailbox state refreshed.");
    } finally {
      setActiveAction(null);
    }
  }, [loadDebugInfo]);

  const handleClearProcessedIds = useCallback(async () => {
    if (!accountId || !folderId) return;

    setActiveAction("clear");
    setActionStatus(null);
    setDebugError(null);

    try {
      await window.electron.clearProcessedUnreadEmailIds(accountId, folderId);
      await loadDebugInfo();
      setActionStatus("Cleared processed unread IDs for this mailbox.");
    } catch (error) {
      console.error("Failed to clear processed unread IDs:", error);
      setDebugError("Could not clear processed unread IDs for the current mailbox.");
    } finally {
      setActiveAction(null);
    }
  }, [accountId, folderId, loadDebugInfo]);

  const handleReprocessUnreadNow = useCallback(async () => {
    if (!accountId || !folderId) return;

    setActiveAction("reprocess");
    setActionStatus(null);
    setDebugError(null);

    try {
      await window.electron.clearProcessedUnreadEmailIds(accountId, folderId);
      await loadDebugInfo();
      await onRunAutoSyncNow();
      await onRefreshEmailMailbox?.();
      await loadDebugInfo();
      setActionStatus("Unread email reprocessing started for this mailbox.");
    } catch (error) {
      console.error("Failed to reprocess unread emails:", error);
      setDebugError("Could not reprocess unread emails for the current mailbox.");
    } finally {
      setActiveAction(null);
    }
  }, [accountId, folderId, loadDebugInfo, onRefreshEmailMailbox, onRunAutoSyncNow]);

  return {
    debugInfo,
    debugLoading,
    debugError,
    actionStatus,
    activeAction,
    canInspectMailbox,
    recentEntries,
    loadDebugInfo,
    handleRefreshDebugInfo,
    handleClearProcessedIds,
    handleReprocessUnreadNow,
  };
}
