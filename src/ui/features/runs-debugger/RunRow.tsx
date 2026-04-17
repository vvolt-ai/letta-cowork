import { useState } from "react";
import type { AgentRun } from "./types";

interface Props {
  run: AgentRun;
  onApprove: (runId: string) => Promise<boolean>;
  onReject: (runId: string) => Promise<boolean>;
  disabled?: boolean;
}

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function StatusBadge({ status }: { status: AgentRun["status"] }) {
  const styleMap: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    running: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-700",
    requires_approval: "bg-orange-100 text-orange-800",
    created: "bg-blue-100 text-blue-800",
  };
  const cls = styleMap[status ?? ""] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status ?? "unknown"}
    </span>
  );
}

export function RunRow({ run, onApprove, onReject, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [rowBusy, setRowBusy] = useState(false);

  const isPending = run.status === "requires_approval";
  const isRunning = run.status === "running";

  const handleApprove = async () => {
    setRowBusy(true);
    await onApprove(run.id);
    setRowBusy(false);
  };
  const handleReject = async () => {
    setRowBusy(true);
    await onReject(run.id);
    setRowBusy(false);
  };
  const handleCopy = () => {
    navigator.clipboard?.writeText(run.id).catch(() => {});
  };

  return (
    <>
      <tr
        className="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
        <td className="px-4 py-3 text-xs text-gray-700">{run.stopReason ?? "—"}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{formatDuration(run.durationMs)}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(run.createdAt)}</td>
        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(run.completedAt)}</td>
        <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{run.id.slice(0, 12)}…</td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            {isPending && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={disabled || rowBusy}
                  className="rounded-md bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={disabled || rowBusy}
                  className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  Reject
                </button>
              </>
            )}
            {isRunning && (
              <button
                onClick={handleReject}
                disabled={disabled || rowBusy}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleCopy}
              className="rounded-md border border-transparent px-2 py-1 text-[11px] text-gray-500 transition hover:border-gray-200 hover:text-gray-700"
              title="Copy run ID"
            >
              Copy ID
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="space-y-3">
              {run.pendingApprovals && run.pendingApprovals.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    Pending Approvals ({run.pendingApprovals.length})
                  </p>
                  <ul className="space-y-1.5">
                    {run.pendingApprovals.map((pa) => (
                      <li
                        key={pa.toolUseId}
                        className="rounded border border-orange-200 bg-white px-3 py-2 text-xs"
                      >
                        <div className="font-medium text-gray-800">{pa.toolName}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-gray-500">{pa.toolUseId}</div>
                        <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] text-gray-600">
                          {typeof pa.input === "string" ? pa.input : JSON.stringify(pa.input, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-semibold text-gray-600">Raw Run</p>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-white p-3 text-[11px] text-gray-700">
                  {JSON.stringify(run.raw ?? run, null, 2)}
                </pre>
              </div>
              {run.conversationId && (
                <div className="text-[11px] text-gray-500">
                  Conversation:{" "}
                  <span className="font-mono">{run.conversationId}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
