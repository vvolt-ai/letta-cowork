import { useEffect, useMemo, useState } from "react";

import { AgentDropdown } from "../../chat/components/AgentDropdown";

type LettaEnvForm = {
  LETTA_API_KEY: string;
  LETTA_BASE_URL: string;
  LETTA_AGENT_ID: string;
};

const emptyForm: LettaEnvForm = {
  LETTA_API_KEY: "",
  LETTA_BASE_URL: "",
  LETTA_AGENT_ID: "",
};

export function EnvironmentSettings() {
  const [form, setForm] = useState<LettaEnvForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const trimmed = useMemo<LettaEnvForm>(() => ({
    LETTA_API_KEY: form.LETTA_API_KEY.trim(),
    LETTA_BASE_URL: form.LETTA_BASE_URL.trim(),
    LETTA_AGENT_ID: form.LETTA_AGENT_ID.trim(),
  }), [form]);

  const valid = Boolean(trimmed.LETTA_API_KEY && trimmed.LETTA_BASE_URL && trimmed.LETTA_AGENT_ID);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setForm(await window.electron.getLettaEnv());
    } catch {
      setError("Failed to load Vera environment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await window.electron.updateLettaEnv(trimmed);
      setSuccess("Environment saved. New conversations will use these values.");
    } catch {
      setError("Failed to save Vera environment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2M4.9 4.9a10 10 0 0 0 0 14.2"/></svg>
          </div>
          <h2 className="text-base font-semibold text-ink-900">Vera runtime connection</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Configure the Letta endpoint and default agent used by new Cowork conversations.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || saving} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-ink-600 transition hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">Refresh</button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]">
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold text-ink-700">Letta API key</span>
            <input type="password" autoComplete="off" value={form.LETTA_API_KEY} onChange={(event) => setForm((current) => ({ ...current, LETTA_API_KEY: event.target.value }))} disabled={loading || saving} placeholder="Enter API key" className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 text-sm text-ink-900 outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-700">Letta base URL</span>
            <input value={form.LETTA_BASE_URL} onChange={(event) => setForm((current) => ({ ...current, LETTA_BASE_URL: event.target.value }))} disabled={loading || saving} placeholder="https://api.letta.com" className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-3 font-mono text-sm text-ink-900 outline-none transition focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/10" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-700">Default agent</span>
            <div className="mt-1.5"><AgentDropdown value={form.LETTA_AGENT_ID} onChange={(agentId) => setForm((current) => ({ ...current, LETTA_AGENT_ID: agentId }))} disabled={loading || saving} /></div>
          </label>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-5 py-4">
          <p className="text-xs text-muted">Changes apply to new sessions; active conversations keep their current runtime.</p>
          <button type="button" onClick={() => void save()} disabled={loading || saving || !valid} className="shrink-0 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Saving…" : "Save environment"}</button>
        </div>
      </div>
    </div>
  );
}
