import { useState, useCallback, useEffect } from "react";

interface LettaAgent { id: string; name: string; }
interface Channel { id: string; name: string; provider: string; isActive: boolean; }

const PROVIDER_EMOJIS: Record<string, string> = {
  slack:    "💬",
  discord:  "🎮",
  telegram: "✈️",
  whatsapp: "📱",
  email:    "📧",
  custom:   "🔗",
};

function ProviderIcon({ provider }: { provider: string }) {
  return (
    <span className="text-base leading-none" role="img" aria-label={provider}>
      {PROVIDER_EMOJIS[provider] ?? "🔗"}
    </span>
  );
}

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
  name: "",
  description: "",
  prompt: "",
  agentId: "",
  conversationId: "",
  scheduleType: "recurring",
  frequency: "daily",
  time: "09:00",
  dayOfWeek: "1",
  cronExpression: "0 9 * * *",
  timezone: "UTC",
  enabled: true,
  notifyChannelId: "",
  notifyTarget: "",
};

// Placeholder hints per provider so the user knows what to enter
const TARGET_HINTS: Record<string, { label: string; placeholder: string; hint: string }> = {
  discord:  { label: "Discord channel ID", placeholder: "e.g. 1234567890123456789", hint: "Right-click a channel in Discord → Copy Channel ID (Developer Mode must be on)" },
  slack:    { label: "Slack channel", placeholder: "e.g. #general or C0123ABCD", hint: "Enter the channel name or ID where the bot should post" },
  telegram: { label: "Telegram chat ID", placeholder: "e.g. -1001234567890", hint: "Use @userinfobot in Telegram to get a chat ID" },
  whatsapp: { label: "WhatsApp number", placeholder: "e.g. +1234567890", hint: "Include country code with + prefix" },
  email:    { label: "Email address", placeholder: "e.g. team@company.com", hint: "The email address to send the notification to" },
  custom:   { label: "Target address", placeholder: "Recipient address", hint: "" },
};

export function CreateScheduleDialog({ open, agents, onClose, onSave, initialValues, mode = "create" }: Props) {
  const [form, setForm] = useState<CreateScheduledTaskForm>({ ...EMPTY_FORM, ...initialValues });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [notifyEnabled, setNotifyEnabled] = useState(!!initialValues?.notifyChannelId);

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, ...initialValues });
      setError(null);
      setNotifyEnabled(!!initialValues?.notifyChannelId);
      // Load available channels
      window.electron.apiListChannels()
        .then((res) => {
          const list = (res.channels ?? []) as Channel[];
          setChannels(list.filter((c) => c.isActive));
        })
        .catch(() => setChannels([]));
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "edit" ? "Edit scheduled task" : "New scheduled task"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-4 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          <span className="mt-0.5">ℹ️</span>
          <span>Tasks only run if the Vera Cowork app is running.</span>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Daily standup summary"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Summarize yesterday's standup notes"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y"
              placeholder="e.g. Summarize the latest standup notes and post to #general"
              value={form.prompt}
              onChange={(e) => set("prompt", e.target.value)}
            />
          </div>

          {/* Schedule type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule type</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(["recurring", "one_off"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => set("scheduleType", type)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    form.scheduleType === type
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {type === "recurring" ? "Recurring" : "One-off"}
                </button>
              ))}
            </div>
          </div>

          {/* Agent */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={form.agentId}
              onChange={(e) => set("agentId", e.target.value)}
            >
              <option value="">Search and select an agent</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Target conversation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target conversation</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {(["", "specific"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => set("conversationId", type === "specific" ? form.conversationId || "" : "")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    (type === "" && !form.conversationId) || (type === "specific" && !!form.conversationId)
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {type === "" ? "Default conversation" : "Specific conversation"}
                </button>
              ))}
            </div>
            {form.conversationId !== "" && (
              <input
                className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Conversation ID (e.g. conv-xxx)"
                value={form.conversationId}
                onChange={(e) => set("conversationId", e.target.value)}
              />
            )}
          </div>

          {/* Frequency */}
          {form.scheduleType === "recurring" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={form.frequency}
                onChange={(e) => set("frequency", e.target.value as CreateScheduledTaskForm["frequency"])}
              >
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          )}

          {/* Time */}
          {form.scheduleType === "recurring" && form.frequency !== "hourly" && form.frequency !== "custom" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              >
                {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          )}

          {/* Day of week */}
          {form.scheduleType === "recurring" && form.frequency === "weekly" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={form.dayOfWeek}
                onChange={(e) => set("dayOfWeek", e.target.value)}
              >
                {DAYS_OF_WEEK.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}

          {/* Custom cron */}
          {form.scheduleType === "recurring" && form.frequency === "custom" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cron expression</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0 9 * * *"
                value={form.cronExpression}
                onChange={(e) => set("cronExpression", e.target.value)}
              />
            </div>
          )}

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </div>

          {/* Cron preview */}
          {form.scheduleType === "recurring" && (
            <p className="text-xs text-gray-500 font-mono">Cron: {cronPreview}</p>
          )}

          <p className="text-xs text-gray-400">
            Scheduled tasks use a randomized delay of several minutes for performance.
          </p>

          {/* ── Notifications ─────────────────────────────────────────── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Section header with toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !notifyEnabled;
                setNotifyEnabled(next);
                if (!next) set("notifyChannelId", "");
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span className="text-sm font-medium text-gray-700">Channel notification</span>
              </div>
              {/* Toggle pill */}
              <div className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${notifyEnabled ? "bg-gray-900" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 mt-0.5 ml-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${notifyEnabled ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </button>

            {notifyEnabled && (
              <div className="px-4 py-3 space-y-3 border-t border-gray-200 bg-white">
                {channels.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No active channels found. Configure a channel in the Channels section first.
                  </p>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Send notification to
                    </label>
                    <div className="flex flex-col gap-1.5">
                      {channels.map((ch) => (
                        <label
                          key={ch.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                            form.notifyChannelId === ch.id
                              ? "border-gray-900 bg-gray-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="notifyChannel"
                            value={ch.id}
                            checked={form.notifyChannelId === ch.id}
                            onChange={() => set("notifyChannelId", ch.id)}
                            className="accent-gray-900"
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <ProviderIcon provider={ch.provider} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{ch.name}</p>
                              <p className="text-xs text-gray-400 capitalize">{ch.provider}</p>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {/* Target input — shown once a channel is selected */}
                    {form.notifyChannelId && (() => {
                      const selectedCh = channels.find((c) => c.id === form.notifyChannelId);
                      const providerHint = TARGET_HINTS[selectedCh?.provider ?? ""] ?? TARGET_HINTS.custom;
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {providerHint.label}
                          </label>
                          <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={providerHint.placeholder}
                            value={form.notifyTarget}
                            onChange={(e) => set("notifyTarget", e.target.value)}
                          />
                          {providerHint.hint && (
                            <p className="mt-1.5 text-xs text-gray-400">{providerHint.hint}</p>
                          )}
                          <p className="mt-1.5 text-xs text-gray-400">
                            A message will be posted when the task completes or fails.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
