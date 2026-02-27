import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

type LettaEnvForm = {
  LETTA_API_KEY: string;
  LETTA_BASE_URL: string;
  LETTA_AGENT_ID: string;
};

interface ChangeEnvProps {
  className?: string;
}

export function ChangeEnv({ className }: ChangeEnvProps = {}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<LettaEnvForm>({
    LETTA_API_KEY: "",
    LETTA_BASE_URL: "",
    LETTA_AGENT_ID: "",
  });

  const openDialog = async () => {
    setOpen(true);
    setSuccess(null);
    setError(null);
    setLoading(true);
    try {
      const values = await window.electron.getLettaEnv();
      setForm(values);
    } catch {
      setError("Failed to load Letta configuration.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      await window.electron.updateLettaEnv({
        LETTA_API_KEY: form.LETTA_API_KEY.trim(),
        LETTA_BASE_URL: form.LETTA_BASE_URL.trim(),
        LETTA_AGENT_ID: form.LETTA_AGENT_ID.trim(),
      });
      setSuccess("Saved. New sessions will use these values.");
    } catch {
      setError("Failed to save Letta configuration.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        className={className ?? "rounded-lg border border-ink-900/10 bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"}
        onClick={openDialog}
      >
        Letta Env
      </button>

      <Dialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setError(null);
            setSuccess(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Letta Environment</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <label className="text-xs text-ink-700">
                LETTA_API_KEY
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
                  value={form.LETTA_API_KEY}
                  onChange={(e) => setForm((prev) => ({ ...prev, LETTA_API_KEY: e.target.value }))}
                  disabled={loading || saving}
                />
              </label>

              <label className="text-xs text-ink-700">
                LETTA_BASE_URL
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
                  value={form.LETTA_BASE_URL}
                  onChange={(e) => setForm((prev) => ({ ...prev, LETTA_BASE_URL: e.target.value }))}
                  disabled={loading || saving}
                />
              </label>

              <label className="text-xs text-ink-700">
                LETTA_AGENT_ID
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
                  value={form.LETTA_AGENT_ID}
                  onChange={(e) => setForm((prev) => ({ ...prev, LETTA_AGENT_ID: e.target.value }))}
                  disabled={loading || saving}
                />
              </label>
            </div>

            {loading && <p className="mt-3 text-xs text-muted">Loading current values...</p>}
            {error && <p className="mt-3 text-xs text-error">{error}</p>}
            {success && <p className="mt-3 text-xs text-success">{success}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-tertiary transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
                onClick={handleSave}
                disabled={loading || saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
