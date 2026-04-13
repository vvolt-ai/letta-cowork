import { useState, useEffect } from "react";
import type { ScheduleRun, ScheduledTask } from "./types";

interface Props {
  task: ScheduledTask | null;
  onClose: () => void;
}

function StatusBadge({ status }: { status: ScheduleRun["status"] }) {
  const styles = {
    running:   "bg-yellow-100 text-yellow-800",
    completed: "bg-green-100 text-green-800",
    failed:    "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

export function ScheduleRunsDrawer({ task, onClose }: Props) {
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!task) { setRuns([]); return; }
    setLoading(true);
    window.electron.schedulerRuns(task.id)
      .then((res: { runs: ScheduleRun[]; total: number }) => {
        setRuns(res.runs ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [task]);

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{task.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">Run history · {total} total</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              Loading runs…
            </div>
          )}
          {!loading && runs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-sm text-gray-400">
              <span className="text-3xl mb-2">📋</span>
              No runs yet
            </div>
          )}
          {!loading && runs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Started</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Duration</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Output</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <>
                    <tr
                      key={run.id}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                    >
                      <td className="px-6 py-3 text-gray-700">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDuration(run.startedAt, run.completedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">
                        {run.output ? run.output.slice(0, 80) : run.error ? `⚠ ${run.error.slice(0, 60)}` : "—"}
                      </td>
                    </tr>
                    {expandedId === run.id && (
                      <tr key={`${run.id}-detail`} className="bg-gray-50 border-b border-gray-100">
                        <td colSpan={4} className="px-6 py-4">
                          {run.output && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-gray-500 mb-1">Output</p>
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white rounded border border-gray-200 p-3 max-h-48 overflow-y-auto">{run.output}</pre>
                            </div>
                          )}
                          {run.error && (
                            <div>
                              <p className="text-xs font-semibold text-red-500 mb-1">Error</p>
                              <pre className="text-xs text-red-700 whitespace-pre-wrap bg-red-50 rounded border border-red-200 p-3">{run.error}</pre>
                            </div>
                          )}
                          {run.conversationId && (
                            <p className="text-xs text-gray-400 mt-2">Conversation: {run.conversationId}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
