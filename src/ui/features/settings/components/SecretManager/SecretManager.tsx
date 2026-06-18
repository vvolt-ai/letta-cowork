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

  return (
    <section className="border-b bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Runtime secrets</p>
          <h3 className="text-base font-semibold text-gray-900">Account Secret Manager</h3>
          <p className="mt-1 text-sm text-gray-600">
            Secrets are encrypted on Vera server and attached to your account. Agent/tool runs under your account receive
            them as environment variables. Values are write-only and hidden after saving.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => void loadSecrets()}
            disabled={loading || saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={addDraft}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add secret
          </button>
        </div>
      </div>

      {error ? <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}

      <div className="mt-4 space-y-3">
        {drafts.map((draft, index) => (
          <div key={draft.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <label className="block text-sm font-medium text-gray-700">
              Secret name #{index + 1}
              <input
                value={draft.name}
                onChange={(event) => updateDraft(draft.id, { name: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })}
                placeholder="API_KEY"
                autoComplete="off"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Secret value #{index + 1}
              <input
                value={draft.value}
                onChange={(event) => updateDraft(draft.id, { value: event.target.value })}
                placeholder="Paste secret value"
                type="password"
                autoComplete="new-password"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </label>
            {drafts.length > 1 ? (
              <button
                type="button"
                onClick={() => removeDraft(draft.id)}
                disabled={saving}
                className="self-end rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-white disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveSecrets()}
            disabled={saving || !drafts.some((draft) => draft.name.trim())}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save secrets"}
          </button>
          <span className="text-sm text-gray-500">
            Example usage in Bash/runtime tools: <code className="rounded bg-gray-100 px-1 py-0.5">{firstUsageExample}</code>
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {secrets.map((secret) => (
          <article key={secret.id} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3">
            <div>
              <h4 className="font-medium text-gray-900">🔐 {secret.name}</h4>
              <p className="text-sm text-gray-500">
                Account secret · {secret.updatedAt ? `Updated ${new Date(secret.updatedAt).toLocaleString()}` : "Saved"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDrafts([newDraft(secret.name)])}
                disabled={saving}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Update value
              </button>
              <button
                type="button"
                onClick={() => void deleteSecret(secret)}
                disabled={saving}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {!secrets.length && !loading ? (
          <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-gray-500">
            No secrets yet. Add one or more name/value rows above.
          </div>
        ) : null}
      </div>
    </section>
  );
}
