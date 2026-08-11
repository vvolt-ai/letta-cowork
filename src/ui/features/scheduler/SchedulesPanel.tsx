import { useState, useEffect, useCallback } from "react";

interface LettaAgent { id: string; name: string; }
import { CreateScheduleDialog } from "./CreateScheduleDialog";
import { ScheduleRunsDrawer } from "./ScheduleRunsDrawer";
import { buildCronExpression } from "./types";
import { InnerPageLayout } from "../layout/components/InnerPageLayout";

import type { ScheduledTask, CreateScheduledTaskForm } from "./types";

interface Props {
  agents: LettaAgent[];
  onClose?: () => void;
}

function EmptyState({ tab, onCreate }: { tab: string; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-6 py-14 text-center shadow-[var(--shadow-soft)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
        <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink-900">No {tab === "recurring" ? "recurring schedules" : "one-off schedules"}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted">
        {tab === "recurring"
          ? "Create an automatic routine that sends a prompt to an agent on a repeating schedule."
          : "Schedule a prompt to run once at a specific date and time."}
      </p>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95"
      >
        <span className="text-base leading-none">+</span> Create schedule
      </button>
    </div>
  );
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${enabled ? "bg-green-500" : "bg-gray-300"}`} />
  );
}

export function SchedulesPanel({ agents, onClose }: Props) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"recurring" | "one_off">("recurring");
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [runsTask, setRunsTask] = useState<ScheduledTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

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
      executionTarget: form.executionTarget,
      cronExpression: cron,
      timezone: form.timezone,
      enabled: form.enabled,
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
      executionTarget: form.executionTarget,
      cronExpression: cron,
      timezone: form.timezone,
      enabled: form.enabled,
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

  const handleRunNow = useCallback(async (task: ScheduledTask) => {
    if (runningId) return;
    try {
      setRunningId(task.id);
      await window.electron.schedulerRunNow(task.id);
      await loadTasks();
      setRunsTask(task);
    } catch (err) {
      console.warn("Run now failed:", err);
      alert(`Failed to run schedule: ${err instanceof Error ? err.message : err}`);
    } finally {
      setRunningId(null);
    }
  }, [loadTasks, runningId]);

  const filtered = tasks.filter((t) => t.scheduleType === activeTab);

  return (
    <InnerPageLayout
      title="Schedules"
      description="Automate messages to your agents on a recurring or one-off schedule."
      onClose={onClose}
      contentWidthClassName="max-w-5xl"
      contentClassName="py-7"
      actions={(
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-95"
        >
          + Create
        </button>
      )}
      headerContent={(
        <div className="inline-flex rounded-xl bg-[var(--color-surface-secondary)] p-1">
          {([["recurring", "Recurring"], ["one_off", "One-off"]] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === value
                  ? "bg-[var(--color-surface)] text-ink-900 shadow-sm"
                  : "text-muted hover:text-ink-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    >

      <div className="min-w-0 space-y-4">
        {loading && (
          <div className="flex h-40 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-muted">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
            Loading schedules…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState tab={activeTab} onCreate={() => setShowCreate(true)} />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
              {filtered.map((task) => (
                <article key={task.id} className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-border-strong)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-ink-900">{task.name}</h3>
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${task.enabled ? "bg-green-50 text-green-700" : "bg-[var(--color-surface-secondary)] text-muted"}`}>
                            <StatusDot enabled={task.enabled} />{task.enabled ? "Active" : "Paused"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted">{task.description || "No description"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        onClick={() => setRunsTask(task)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)]"
                        title="View runs"
                      >
                        Runs {task.runCount ? `(${task.runCount})` : ""}
                      </button>
                      <button
                        onClick={() => handleRunNow(task)}
                        disabled={runningId === task.id}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-600 hover:bg-[var(--color-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                        title="Run now"
                      >
                        {runningId === task.id ? "Running…" : "Run now"}
                      </button>
                      <button
                        onClick={() => setEditTask(task)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-600 hover:bg-[var(--color-surface-secondary)]"
                        title="Edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(task.id)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-ink-600 hover:bg-[var(--color-surface-secondary)]"
                        title={task.enabled ? "Pause" : "Resume"}
                      >
                        {task.enabled ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 border-t border-[var(--color-border)] pt-3 sm:grid-cols-4">
                    <div><div className="text-[10px] font-medium uppercase tracking-wide text-muted">Schedule</div><div className="mt-1 font-mono text-[11px] text-ink-700">{task.cronExpression}</div></div>
                    <div><div className="text-[10px] font-medium uppercase tracking-wide text-muted">Runs on</div><div className="mt-1 text-xs text-ink-700">{(task.executionTarget ?? "cowork") === "server" ? "Server" : "Cowork"}</div></div>
                    <div><div className="text-[10px] font-medium uppercase tracking-wide text-muted">Timezone</div><div className="mt-1 truncate text-xs text-ink-700">{task.timezone}</div></div>
                    <div><div className="text-[10px] font-medium uppercase tracking-wide text-muted">Created</div><div className="mt-1 text-xs text-ink-700">{new Date(task.createdAt).toLocaleDateString()}</div></div>
                  </div>
                </article>
              ))}
          </div>
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
            executionTarget: editTask.executionTarget ?? "cowork",
            frequency: "custom",
            cronExpression: editTask.cronExpression,
            timezone: editTask.timezone,
            enabled: editTask.enabled,
          }}
        />
      )}

      <ScheduleRunsDrawer task={runsTask} onClose={() => setRunsTask(null)} />
    </InnerPageLayout>
  );
}
