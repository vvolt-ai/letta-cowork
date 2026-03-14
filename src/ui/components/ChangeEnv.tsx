import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AgentDropdown } from "./AgentDropdown";

type LettaEnvForm = {
  LETTA_API_KEY: string;
  LETTA_BASE_URL: string;
  LETTA_AGENT_ID: string;
};

interface ChangeEnvProps {
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ChangeEnv({ className, open: controlledOpen, onOpenChange }: ChangeEnvProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState<LettaEnvForm>({
    LETTA_API_KEY: "",
    LETTA_BASE_URL: "",
    LETTA_AGENT_ID: "",
  });

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const trimmedForm: LettaEnvForm = {
    LETTA_API_KEY: form.LETTA_API_KEY.trim(),
    LETTA_BASE_URL: form.LETTA_BASE_URL.trim(),
    LETTA_AGENT_ID: form.LETTA_AGENT_ID.trim(),
  };
  const isFormValid =
    trimmedForm.LETTA_API_KEY.length > 0 &&
    trimmedForm.LETTA_BASE_URL.length > 0 &&
    trimmedForm.LETTA_AGENT_ID.length > 0;

  useEffect(() => {
    window.electron.isAdmin().then(setIsAdmin);
  }, []);

  const openDialog = () => {
    setSuccess(null);
    setError(null);
    setOpen(true);
  };

  const handleSave = async () => {
    if (!isFormValid) {
      setError("LETTA_API_KEY, LETTA_BASE_URL, and LETTA_AGENT_ID cannot be blank.");
      return;
    }
    setSaving(true);
    setSuccess(null);
    setError(null);
    try {
      await window.electron.updateLettaEnv(trimmedForm);
      setSuccess("Saved. New sessions will use these values.");
      setOpen(false);
    } catch {
      setError("Failed to save Vera configuration.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setSuccess(null);
    setError(null);

    window.electron
      .getLettaEnv()
      .then((values) => {
        setForm(values);
      })
      .catch(() => {
        setError("Failed to load Vera configuration.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  return (
    <>
      {isAdmin && (
        <button
          className={className ?? "rounded-lg border border-ink-900/10 bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"}
          onClick={openDialog}
        >
          Vera Environment
        </button>
      )}

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
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Vera Environment</Dialog.Title>
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
                  required
                />
              </label>

              <label className="text-xs text-ink-700">
                LETTA_BASE_URL
                <input
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
                  value={form.LETTA_BASE_URL}
                  onChange={(e) => setForm((prev) => ({ ...prev, LETTA_BASE_URL: e.target.value }))}
                  disabled={loading || saving}
                  required
                />
              </label>

              <label className="text-xs text-ink-700">
                LETTA_AGENT_ID
                <AgentDropdown
                  value={form.LETTA_AGENT_ID}
                  onChange={(agentId) => setForm((prev) => ({ ...prev, LETTA_AGENT_ID: agentId }))}
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
                disabled={loading || saving || !isFormValid}
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
