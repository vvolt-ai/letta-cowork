import { useCallback, useEffect, useMemo, useState } from "react";

type AgentSecret = {
  id: string;
  name: string;
  keyVersion?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SecretDraft = {
  id: string;
  name: string;
  value: string;
};

const SECRET_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const RESERVED_SECRET_NAMES = new Set([
  "PATH",
  "HOME",
  "PWD",
  "SHELL",
  "NODE_ENV",
  "NODE_OPTIONS",
  "AGENT_ID",
  "LETTA_AGENT_ID",
  "MEMORY_DIR",
  "LETTA_MEMORY_DIR",
  "VERA_TOKEN",
  "COWORK_TOKEN",
  "VERA_SERVER_URL",
  "COWORK_SERVER_URL",
]);

function newDraft(name = ""): SecretDraft {
  return { id: crypto.randomUUID(), name, value: "" };
}

function normalizeSecretName(value: string): string {
  return value.trim().toUpperCase();
}

function validateSecretName(name: string): string | null {
  if (!name) return "Secret name is required.";
  if (!SECRET_NAME_PATTERN.test(name)) {
    return "Use uppercase letters, numbers, and underscores only. Must start with a letter or underscore.";
  }
  if (RESERVED_SECRET_NAMES.has(name)) {
    return `${name} is reserved and cannot be managed here.`;
  }
  return null;
}

function getResultError(result: { success?: boolean; error?: string }, fallback: string): string | null {
  if (result?.success === false) return result.error || fallback;
  return null;
}

export function SecretManager() {
  const [secrets, setSecrets] = useState<AgentSecret[]>([]);
  const [drafts, setDrafts] = useState<SecretDraft[]>([newDraft()]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firstUsageExample = useMemo(() => {
    const name = drafts.find((draft) => draft.name.trim())?.name.trim().toUpperCase();
    return name ? `$${name}` : "$API_KEY";
  }, [drafts]);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.apiListAgentSecrets();
      const resultError = getResultError(result, "Failed to load secrets");
      if (resultError) throw new Error(resultError);
      setSecrets(result.secrets || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load secrets");
      setSecrets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecrets();
  }, [loadSecrets]);

  function updateDraft(id: string, patch: Partial<SecretDraft>) {
    setDrafts((previous) => previous.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }

  function addDraft() {
    setDrafts((previous) => [...previous, newDraft()]);
  }

  function removeDraft(id: string) {
    setDrafts((previous) => (previous.length <= 1 ? previous : previous.filter((draft) => draft.id !== id)));
  }

  async function saveSecrets() {
    const rows = drafts
      .map((draft) => ({ name: normalizeSecretName(draft.name), value: draft.value }))
      .filter((draft) => draft.name || draft.value);

    if (!rows.length) {
      setError("Add at least one secret name/value row.");
      setMessage(null);
      return;
    }

    for (const row of rows) {
      const nameError = validateSecretName(row.name);
      if (nameError) {
        setError(nameError);
        setMessage(null);
        return;
      }
      if (!row.value) {
        setError(`Value is required for ${row.name}.`);
        setMessage(null);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      for (const row of rows) {
        const result = await window.electron.apiUpsertAgentSecret(row);
        const resultError = getResultError(result, `Failed to save ${row.name}`);
        if (resultError) throw new Error(resultError);
      }
      setDrafts([newDraft()]);
      await loadSecrets();
      setMessage(`${rows.length} secret${rows.length === 1 ? "" : "s"} saved.`);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save secrets");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSecret(secret: AgentSecret) {
    if (!window.confirm(`Delete secret "${secret.name}"?`)) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await window.electron.apiDeleteAgentSecret(secret.id);
      const resultError = getResultError(result, `Failed to delete ${secret.name}`);
      if (resultError) throw new Error(resultError);
      await loadSecrets();
      setMessage(`${secret.name} deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete secret");
    } finally {
      setSaving(false);
    }
  }

  const openNewSecret = () => {
    setDrafts([newDraft()]);
    setError(null);
    setShowForm(true);
  };

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
          <h2 className="text-base font-semibold text-ink-900">Saved runtime secrets</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Encrypted account values exposed to authorized agent and tool runs as environment variables. Saved values remain hidden.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => void loadSecrets()} disabled={loading || saving} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-ink-600 hover:bg-[var(--color-surface-secondary)] disabled:opacity-50">Refresh</button>
          <button type="button" onClick={openNewSecret} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"><span className="text-base leading-none">+</span> Add secret</button>
        </div>
      </div>

      {error && !showForm ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-soft)]">
        {secrets.map((secret) => (
          <article key={secret.id} className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] p-4 last:border-b-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>
              <div className="min-w-0"><h4 className="truncate font-mono text-sm font-semibold text-ink-900">{secret.name}</h4>
              <p className="mt-0.5 text-xs text-muted">
                Account secret · {secret.updatedAt ? `Updated ${new Date(secret.updatedAt).toLocaleString()}` : "Saved"}
              </p></div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setDrafts([newDraft(secret.name)]); setError(null); setShowForm(true); }}
                disabled={saving}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-[var(--color-surface-secondary)] disabled:opacity-50"
              >
                Update value
              </button>
              <button
                type="button"
                onClick={() => void deleteSecret(secret)}
                disabled={saving}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {!secrets.length && !loading ? (
          <div className="p-12 text-center text-sm text-muted">
            No runtime secrets saved yet.
          </div>
        ) : null}
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm" onClick={() => setShowForm(false)} aria-label="Close secret form" />
          <div className="relative flex max-h-[88vh] w-full max-w-[680px] flex-col overflow-hidden rounded-3xl border border-white/70 bg-[var(--color-surface)] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5"><div><h3 className="text-lg font-semibold text-ink-900">Add runtime secret</h3><p className="mt-1 text-sm text-muted">Values are encrypted and become write-only after saving.</p></div><button type="button" onClick={() => setShowForm(false)} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-[var(--color-surface-secondary)]">✕</button></div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {drafts.map((draft, index) => <div key={draft.id} className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-000)] p-4 md:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-semibold text-ink-700">Secret name #{index + 1}<input value={draft.name} onChange={(event) => updateDraft(draft.id, { name: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} placeholder="API_KEY" autoComplete="off" className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] px-3 font-mono text-sm outline-none focus:border-[var(--color-accent)]" /></label><label className="text-xs font-semibold text-ink-700">Secret value #{index + 1}<input value={draft.value} onChange={(event) => updateDraft(draft.id, { value: event.target.value })} placeholder="Paste secret value" type="password" autoComplete="new-password" className="mt-1.5 h-10 w-full rounded-xl border border-[var(--color-border)] px-3 text-sm outline-none focus:border-[var(--color-accent)]" /></label>{drafts.length > 1 ? <button type="button" onClick={() => removeDraft(draft.id)} className="self-end rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-ink-600">Remove</button> : null}</div>)}
              <button type="button" onClick={addDraft} className="text-xs font-semibold text-[var(--color-accent)]">+ Add another secret</button>
              <p className="text-xs text-muted">Example runtime usage: <code className="rounded bg-[var(--color-surface-secondary)] px-1.5 py-0.5">{firstUsageExample}</code></p>
              {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-6 py-4"><button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-ink-700">Cancel</button><button type="button" onClick={() => void saveSecrets()} disabled={saving || !drafts.some((draft) => draft.name.trim())} className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save secrets"}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
