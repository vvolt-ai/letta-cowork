import { useState, useEffect, useCallback } from "react";

interface LettaAgent { id: string; name: string; }
import type { ScheduledTask, CreateScheduledTaskForm } from "./types";
import { buildCronExpression } from "./types";
import { CreateScheduleDialog } from "./CreateScheduleDialog";
import { ScheduleRunsDrawer } from "./ScheduleRunsDrawer";

interface Props {
  agents: LettaAgent[];
}

function EmptyState({ tab, onCreate }: { tab: string; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="w-20 h-20 opacity-20">
        <svg viewBox="0 0 80 80" fill="none" className="w-full h-full text-gray-400">
          <rect x="10" y="10" width="60" height="60" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="6 4"/>
          <rect x="20" y="20" width="40" height="40" rx="2" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
          <rect x="30" y="30" width="20" height="20" rx="1" stroke="currentColor" strokeWidth="2"/>
        </svg>
      </div>
      <p className="text-sm text-gray-500">
        No {tab === "recurring" ? "recurring" : "one-off"} tasks
      </p>
      <button
        onClick={onCreate}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
      >
        + Create new scheduled task
      </button>
    </div>
  );
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
  );
}

export function SchedulesPanel({ agents }: Props) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"recurring" | "one_off">("recurring");
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [runsTask, setRunsTask] = useState<ScheduledTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const result = await window.electron.schedulerList();
      setTasks(result ?? []);
    } catch (err) {
      setError("Failed to load schedules. Make sure you're connected to the server.");
      console.warn("[SchedulesPanel] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleCreate = useCallback(async (form: CreateScheduledTaskForm) => {
    const cron = buildCronExpression(form);
    await window.electron.schedulerCreate({
      name: form.name,
      description: form.description || undefined,
      prompt: form.prompt,
      agentId: form.agentId,
      conversationId: form.conversationId || undefined,
      scheduleType: form.scheduleType,
      cronExpression: cron,
      timezone: form.timezone,
      enabled: form.enabled,
      notifyChannelId: form.notifyChannelId || undefined,
      notifyTarget: form.notifyTarget || undefined,
    });
    await loadTasks();
  }, [loadTasks]);

  const handleEdit = useCallback(async (form: CreateScheduledTaskForm) => {
    if (!editTask) return;
    const cron = buildCronExpression(form);
    await window.electron.schedulerUpdate(editTask.id, {
      name: form.name,
      description: form.description || undefined,
      prompt: form.prompt,
      agentId: form.agentId,
      conversationId: form.conversationId || undefined,
      scheduleType: form.scheduleType,
      cronExpression: cron,
      timezone: form.timezone,
      enabled: form.enabled,
      notifyChannelId: form.notifyChannelId || undefined,
      notifyTarget: form.notifyTarget || undefined,
    });
    setEditTask(null);
    await loadTasks();
  }, [editTask, loadTasks]);

  const handleToggle = useCallback(async (id: string) => {
    try {
      await window.electron.schedulerToggle(id);
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t));
    } catch (err) {
      console.warn("Toggle failed:", err);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this scheduled task?")) return;
    try {
      await window.electron.schedulerDelete(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.warn("Delete failed:", err);
    }
  }, []);

  const filtered = tasks.filter((t) => t.scheduleType === activeTab);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-8 pt-8 pb-4">
        <div className="flex items-start justify-between mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Schedules</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {}} // TODO: help tooltip
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              What are schedules?
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              + Create
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500">Schedules let you automate messages to your agent on a predetermined schedule</p>
      </div>

      {/* Tabs */}
      <div className="px-8 border-b border-gray-200">
        <div className="flex gap-1">
          {([["recurring", "Recurring"], ["one_off", "One-off"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === value
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            Loading schedules…
          </div>
        )}

        {error && (
          <div className="mx-8 mt-6 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState tab={activeTab} onCreate={() => setShowCreate(true)} />
        )}

        {!loading && !error && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-8 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Schedule</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Timezone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-2">
                      <StatusDot enabled={task.enabled} />
                      <span className="font-medium text-gray-900">{task.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-500 max-w-[200px] truncate">
                    {task.description ?? "—"}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      task.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {task.enabled ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-gray-600">
                    {task.cronExpression}
                  </td>
                  <td className="px-4 py-4 text-gray-500 text-xs">{task.timezone}</td>
                  <td className="px-4 py-4 text-gray-400 text-xs">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setRunsTask(task)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        title="View runs"
                      >
                        Runs {task.runCount ? `(${task.runCount})` : ""}
                      </button>
                      <button
                        onClick={() => setEditTask(task)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(task.id)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                        title={task.enabled ? "Pause" : "Resume"}
                      >
                        {task.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialogs */}
      <CreateScheduleDialog
        open={showCreate}
        agents={agents}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        mode="create"
      />

      {editTask && (
        <CreateScheduleDialog
          open={!!editTask}
          agents={agents}
          onClose={() => setEditTask(null)}
          onSave={handleEdit}
          mode="edit"
          initialValues={{
            name: editTask.name,
            description: editTask.description ?? "",
            prompt: editTask.prompt,
            agentId: editTask.agentId,
            conversationId: editTask.conversationId ?? "",
            scheduleType: editTask.scheduleType,
            frequency: "custom",
            cronExpression: editTask.cronExpression,
            timezone: editTask.timezone,
            enabled: editTask.enabled,
            notifyChannelId: editTask.notifyChannelId ?? "",
            notifyTarget: (editTask as any).notifyTarget ?? "",
          }}
        />
      )}

      <ScheduleRunsDrawer task={runsTask} onClose={() => setRunsTask(null)} />
    </div>
  );
}
