import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentRun, RunStatusFilter } from "../types";

interface UseAgentRunsOptions {
  agentId?: string;
  conversationId?: string;
  status: RunStatusFilter;
  limit: number;
  offset: number;
  autoRefreshMs?: number;
}

interface UseAgentRunsResult {
  runs: AgentRun[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  approve: (runId: string) => Promise<boolean>;
  reject: (runId: string) => Promise<boolean>;
  approveAll: () => Promise<{ approved: string[]; failed: Array<{ runId: string; error: string }> } | null>;
  rejectAll: () => Promise<{ cancelled: string[]; failed: Array<{ runId: string; error: string }> } | null>;
  bulkInFlight: boolean;
}

export function useAgentRuns(options: UseAgentRunsOptions): UseAgentRunsResult {
  const { agentId, conversationId, status, limit, offset, autoRefreshMs = 5000 } = options;
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkInFlight, setBulkInFlight] = useState(false);

  // Keep latest params in refs so the refresh loop always sees current values
  const paramsRef = useRef({ agentId, conversationId, status, limit, offset });
  paramsRef.current = { agentId, conversationId, status, limit, offset };

  const bulkInFlightRef = useRef(false);
  bulkInFlightRef.current = bulkInFlight;

  const refresh = useCallback(async () => {
    const p = paramsRef.current;
    if (!p.agentId) {
      setRuns([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.electron.listAgentRuns({
        agentId: p.agentId,
        conversationId: p.conversationId || undefined,
        status: p.status,
        limit: p.limit,
        offset: p.offset,
      });
      setRuns(res.runs ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + param-change fetch
  useEffect(() => {
    void refresh();
  }, [agentId, conversationId, status, limit, offset, refresh]);

  // Auto-refresh (paused during bulk operations)
  useEffect(() => {
    if (!agentId || autoRefreshMs <= 0) return;
    const id = setInterval(() => {
      if (!bulkInFlightRef.current) void refresh();
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [agentId, autoRefreshMs, refresh]);

  const approve = useCallback(async (runId: string) => {
    try {
      const res = await window.electron.approveAgentRun(runId);
      await refresh();
      return !!res?.success;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, [refresh]);

  const reject = useCallback(async (runId: string) => {
    try {
      const res = await window.electron.rejectAgentRun(runId);
      await refresh();
      return !!res?.success;
    } catch (e) {
      setError(String(e));
      return false;
    }
  }, [refresh]);

  const approveAll = useCallback(async () => {
    if (!agentId) return null;
    setBulkInFlight(true);
    try {
      const res = await window.electron.approveAllAgentRuns(agentId, conversationId || undefined);
      await refresh();
      return res;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBulkInFlight(false);
    }
  }, [agentId, conversationId, refresh]);

  const rejectAll = useCallback(async () => {
    if (!agentId) return null;
    setBulkInFlight(true);
    try {
      const res = await window.electron.rejectAllAgentRuns(agentId, conversationId || undefined);
      await refresh();
      return res;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBulkInFlight(false);
    }
  }, [agentId, conversationId, refresh]);

  return { runs, total, loading, error, refresh, approve, reject, approveAll, rejectAll, bulkInFlight };
}
