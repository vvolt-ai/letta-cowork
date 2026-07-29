import { useState, useCallback, useEffect } from "react";

interface LettaAgent { id: string; name: string; }

import {
  type CreateScheduledTaskForm,
  buildCronExpression,
  TIMEZONES,
  FREQUENCIES,
  DAYS_OF_WEEK,
  TIME_OPTIONS,
} from "./types";

interface Props {
  open: boolean;
  agents: LettaAgent[];
  onClose: () => void;
  onSave: (form: CreateScheduledTaskForm) => Promise<void>;
  initialValues?: Partial<CreateScheduledTaskForm>;
  mode?: "create" | "edit";
}

const EMPTY_FORM: CreateScheduledTaskForm = {
  name: "", description: "", prompt: "", agentId: "", conversationId: "",
  scheduleType: "recurring", executionTarget: "cowork", frequency: "daily",
  time: "09:00", dayOfWeek: "1", cronExpression: "0 9 * * *", timezone: "UTC", enabled: true,
};

const inputClass = "w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-xs text-ink-900 outline-none transition placeholder:text-muted focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent-subtle)]";
const labelClass = "mb-1.5 block text-[11px] font-semibold text-ink-700";

export function CreateScheduleDialog({ open, agents, onClose, onSave, initialValues, mode = "create" }: Props) {
  const [form, setForm] = useState<CreateScheduledTaskForm>({ ...EMPTY_FORM, ...initialValues });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, ...initialValues });
      setError(null);
    }
  }, [open, initialValues]);

  const set = useCallback(<K extends keyof CreateScheduledTaskForm>(key: K, value: CreateScheduledTaskForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const cronPreview = buildCronExpression(form);

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.prompt.trim()) { setError("Prompt is required"); return; }
    if (!form.agentId) { setError("Please select an agent"); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...form, cronExpression: cronPreview });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const Segment = <T extends string>({ values, value, labels, onChange }: { values: readonly T[]; value: T; labels: Record<T, string>; onChange: (next: T) => void }) => (
    <div className="inline-flex w-full rounded-xl bg-[var(--color-surface-secondary)] p-1">
      {values.map((item) => (
        <button key={item} type="button" onClick={() => onChange(item)} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-semibold transition ${value === item ? "bg-[var(--color-surface)] text-ink-900 shadow-sm" : "text-muted hover:text-ink-900"}`}>
          {labels[item]}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/35 p-5 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[86vh] w-full max-w-[760px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-[var(--color-bg-000)] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>
            </span>
            <div>
              <h2 className="text-base font-semibold text-ink-900">{mode === "edit" ? "Edit schedule" : "Create schedule"}</h2>
              <p className="mt-0.5 text-[11px] text-muted">Automate a prompt for one of your agents.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-muted transition hover:bg-[var(--color-surface-secondary)] hover:text-ink-900" aria-label="Close"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-4"><h3 className="text-xs font-semibold text-ink-900">Task</h3><p className="mt-0.5 text-[10px] text-muted">Describe what the agent should do.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>Name</label><input className={inputClass} placeholder="Daily standup summary" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
              <div><label className={labelClass}>Description <span className="font-normal text-muted">(optional)</span></label><input className={inputClass} placeholder="Summarize yesterday’s notes" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Prompt</label><textarea className={`${inputClass} min-h-[88px] resize-y`} placeholder="Tell the agent exactly what to do…" value={form.prompt} onChange={(e) => set("prompt", e.target.value)} /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-4"><h3 className="text-xs font-semibold text-ink-900">Agent and execution</h3><p className="mt-0.5 text-[10px] text-muted">Choose who runs this task and where it executes.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>Agent</label><select className={inputClass} value={form.agentId} onChange={(e) => set("agentId", e.target.value)}><option value="">Select an agent…</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></div>
              <div><label className={labelClass}>Run on</label><Segment values={["cowork", "server"] as const} value={form.executionTarget} labels={{ cowork: "Cowork app", server: "Server" }} onChange={(next) => set("executionTarget", next)} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Target conversation</label><Segment values={["default", "specific"] as const} value={form.conversationId ? "specific" : "default"} labels={{ default: "Default conversation", specific: "Specific conversation" }} onChange={(next) => set("conversationId", next === "specific" ? "specific" : "")} />{form.conversationId ? <input className={`${inputClass} mt-2 font-mono`} placeholder="conv-…" value={form.conversationId === "specific" ? "" : form.conversationId} onChange={(e) => set("conversationId", e.target.value)} autoFocus /> : null}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-4"><h3 className="text-xs font-semibold text-ink-900">Timing</h3><p className="mt-0.5 text-[10px] text-muted">Choose when and how often this task runs.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={labelClass}>Schedule type</label><Segment values={["recurring", "one_off"] as const} value={form.scheduleType} labels={{ recurring: "Recurring", one_off: "One-off" }} onChange={(next) => set("scheduleType", next)} /></div>
              {form.scheduleType === "recurring" ? <div><label className={labelClass}>Frequency</label><select className={inputClass} value={form.frequency} onChange={(e) => set("frequency", e.target.value as CreateScheduledTaskForm["frequency"])}>{FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div> : null}
              {form.scheduleType === "recurring" && form.frequency !== "hourly" && form.frequency !== "custom" ? <div><label className={labelClass}>Time</label><select className={inputClass} value={form.time} onChange={(e) => set("time", e.target.value)}>{TIME_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div> : null}
              {form.scheduleType === "recurring" && form.frequency === "weekly" ? <div><label className={labelClass}>Day of week</label><select className={inputClass} value={form.dayOfWeek} onChange={(e) => set("dayOfWeek", e.target.value)}>{DAYS_OF_WEEK.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div> : null}
              {form.scheduleType === "recurring" && form.frequency === "custom" ? <div><label className={labelClass}>Cron expression</label><input className={`${inputClass} font-mono`} placeholder="0 9 * * *" value={form.cronExpression} onChange={(e) => set("cronExpression", e.target.value)} /></div> : null}
              <div><label className={labelClass}>Timezone</label><select className={inputClass} value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>{TIMEZONES.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select></div>
            </div>
            {form.scheduleType === "recurring" ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2 text-[10px] text-muted"><span>Schedule preview</span><code className="font-mono font-semibold text-ink-700">{cronPreview}</code></div> : null}
          </section>

          <div className="flex gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-accent-subtle)] p-3 text-[11px] leading-5 text-ink-700"><span className="text-[var(--color-accent)]">✦</span><p><span className="font-semibold">Need a notification?</span> Include it in the prompt—for example, “send the summary to WhatsApp +1234567890.” Scheduled runs may use a short randomized delay.</p></div>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div> : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-medium text-ink-600 transition hover:bg-[var(--color-surface-secondary)]">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50">{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create schedule"}</button>
        </footer>
      </div>
    </div>
  );
}
