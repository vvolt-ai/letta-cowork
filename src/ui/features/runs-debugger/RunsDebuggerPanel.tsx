import { useEffect, useMemo, useState } from "react";
import { RUN_STATUS_FILTERS, type RunStatusFilter } from "./types";
import { useAgentRuns } from "./hooks/useAgentRuns";
import { RunRow } from "./RunRow";
import { BulkActionDialog } from "./BulkActionDialog";

const PAGE_SIZE = 25;

interface AgentOption {
  id: string;
  name: string;
}

interface Props {
  defaultAgentId?: string;
  defaultConversationId?: string;
  onClose?: () => void;
}

export function RunsDebuggerPanel({ defaultAgentId, defaultConversationId, onClose }: Props) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [agentId, setAgentId] = useState<string | undefined>(defaultAgentId);
  const [conversationIdFilter, setConversationIdFilter] = useState(defaultConversationId ?? "");
  const [conversationIdApplied, setConversationIdApplied] = useState(defaultConversationId ?? "");
  const [statusFilter, setStatusFilter] = useState<RunStatusFilter>("all");
  const [offset, setOffset] = useState(0);
  const [bulkDialog, setBulkDialog] = useState<"approve" | "reject" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load agents for dropdown
  useEffect(() => {
    window.electron
      .listLettaAgents()
      .then((list) => setAgents((list as Array<{ id: string; name: string }>).map((a) => ({ id: a.id, name: a.name }))))
      .catch((err) => console.warn("[RunsDebugger] failed to load agents:", err));
  }, []);

  // Re-apply defaultAgentId if it changes (e.g., user switches active session)
  useEffect(() => {
    if (defaultAgentId && !agentId) setAgentId(defaultAgentId);
  }, [defaultAgentId, agentId]);

  // Re-apply defaultConversationId when it changes (e.g., user opens Runs from a different conversation header)
  useEffect(() => {
    if (defaultConversationId) {
      setConversationIdFilter(defaultConversationId);
      setConversationIdApplied(defaultConversationId);
    }
  }, [defaultConversationId]);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [agentId, conversationIdApplied, statusFilter]);

  const {
    runs,
    total,
    loading,
    error,
    refresh,
    approve,
    reject,
    approveAll,
    rejectAll,
    bulkInFlight,
  } = useAgentRuns({
    agentId,
    conversationId: conversationIdApplied || undefined,
    status: statusFilter,
    limit: PAGE_SIZE,
    offset,
  });

  const pendingCount = useMemo(
    () => runs.filter((r) => r.status === "requires_approval").length,
    [runs]
  );

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleBulkConfirm = async () => {
    if (!bulkDialog) return;
    const op = bulkDialog;
    setBulkDialog(null);
    let done = 0;
    let failed = 0;
    if (op === "approve") {
      const res = await approveAll();
      if (!res) {
        setToast("Bulk action failed — see console.");
        return;
      }
      done = res.approved.length;
      failed = res.failed.length;
      if (failed > 0) console.warn("[RunsDebugger] Bulk approve failures:", res.failed);
    } else {
      const res = await rejectAll();
      if (!res) {
        setToast("Bulk action failed — see console.");
        return;
      }
      done = res.cancelled.length;
      failed = res.failed.length;
      if (failed > 0) console.warn("[RunsDebugger] Bulk reject failures:", res.failed);
    }
    setToast(
      failed === 0
        ? `${op === "approve" ? "Approved" : "Rejected"} ${done} run${done === 1 ? "" : "s"}.`
        : `${op === "approve" ? "Approved" : "Rejected"} ${done} / ${done + failed}. ${failed} failed — see console.`
    );
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Runs Debugger</h2>
            <p className="text-xs text-gray-500">
              Inspect, approve, and reject agent runs. {total} total in view.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close runs debugger"
                title="Close and return to conversation"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            Agent:
            <select
              value={agentId ?? ""}
              onChange={(e) => setAgentId(e.target.value || undefined)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            >
              <option value="">— Select —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            Conversation:
            <input
              type="text"
              placeholder="conv-..."
              value={conversationIdFilter}
              onChange={(e) => setConversationIdFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setConversationIdApplied(conversationIdFilter.trim());
              }}
              className="w-48 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-mono"
            />
            <button
              onClick={() => setConversationIdApplied(conversationIdFilter.trim())}
              className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200"
            >
              Apply
            </button>
            {conversationIdApplied && (
              <button
                onClick={() => {
                  setConversationIdFilter("");
                  setConversationIdApplied("");
                }}
                className="text-xs text-blue-600 hover:underline"
              >
                clear
              </button>
            )}
          </label>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {RUN_STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                statusFilter === f.value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Bulk action bar */}
        <div className="flex items-center justify-between rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2">
          <div className="text-xs text-gray-600">
            {pendingCount > 0 ? (
              <span>
                <strong>{pendingCount}</strong> run{pendingCount === 1 ? "" : "s"} waiting for approval on this page.
              </span>
            ) : (
              <span>No runs waiting for approval on this page.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkDialog("approve")}
              disabled={pendingCount === 0 || bulkInFlight}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              Approve All Pending
            </button>
            <button
              onClick={() => setBulkDialog("reject")}
              disabled={pendingCount === 0 || bulkInFlight}
              className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              Reject All Pending
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {!agentId ? (
          <div className="flex h-48 flex-col items-center justify-center text-sm text-gray-400">
            <span className="mb-2 text-3xl">🧭</span>
            Select an agent to view runs
          </div>
        ) : runs.length === 0 && !loading ? (
          <div className="flex h-48 flex-col items-center justify-center text-sm text-gray-400">
            <span className="mb-2 text-3xl">📭</span>
            No runs match the current filters
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Stop Reason</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Duration</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Created At</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Completed At</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Run ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  onApprove={approve}
                  onReject={reject}
                  disabled={bulkInFlight}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-gray-100 bg-white px-6 py-3 text-xs text-gray-600">
          <div>
            Page {page} of {pageCount} · {total} total
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk confirmation dialog */}
      <BulkActionDialog
        open={bulkDialog !== null}
        mode={bulkDialog ?? "approve"}
        count={pendingCount}
        busy={bulkInFlight}
        onConfirm={handleBulkConfirm}
        onCancel={() => setBulkDialog(null)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-40 rounded-md bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
