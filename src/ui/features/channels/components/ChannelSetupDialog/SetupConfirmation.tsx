import * as Dialog from "@radix-ui/react-dialog";

interface SetupConfirmationProps {
  saveMessage: string;
  loading: boolean;
  onSave: () => void;
}

export function SetupConfirmation({ saveMessage, loading, onSave }: SetupConfirmationProps) {
  return (
    <>
      {saveMessage && <div className="mt-3 text-xs text-success">{saveMessage}</div>}
      {loading && <div className="mt-2 text-xs text-muted">Loading channel setup...</div>}

      <div className="mt-4 flex justify-end gap-2">
        <Dialog.Close asChild>
          <button className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-tertiary transition-colors">
            Close
          </button>
        </Dialog.Close>
        <button
          className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
          onClick={() => {
            void onSave();
          }}
        >
          Save Setup
        </button>
      </div>
    </>
  );
}
