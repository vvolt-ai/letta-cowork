import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface SkillDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skillUrl: string;
  onSkillUrlChange: (url: string) => void;
  skillName: string;
  onSkillNameChange: (name: string) => void;
  skillDownloading: boolean;
  skillDownloadSuccess: boolean;
  skillDownloadError: string | null;
  onDownload: () => Promise<void>;
  onReset: () => void;
}

export function SkillDownloadDialog({
  open,
  onOpenChange,
  skillUrl,
  onSkillUrlChange,
  skillName,
  onSkillNameChange,
  skillDownloading,
  skillDownloadSuccess,
  skillDownloadError,
  onDownload,
  onReset,
}: SkillDownloadDialogProps) {
  useEffect(() => {
    if (skillDownloadSuccess) {
      const timer = setTimeout(() => {
        onOpenChange(false);
        // give a brief moment before resetting to see the success message
        setTimeout(() => {
          onReset();
        }, 300);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [skillDownloadSuccess, onOpenChange, onReset]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      onOpenChange(false);
      onReset();
    } else {
      onOpenChange(true);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-ink-800">Download Skill</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          {skillDownloadSuccess ? (
            <div className="mt-6 flex flex-col items-center justify-center gap-3 py-6">
              <svg viewBox="0 0 24 24" className="h-12 w-12 text-success" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12l4 4L19 6" />
              </svg>
              <p className="text-center text-sm font-medium text-ink-700">Skill downloaded successfully!</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-ink-700">GitHub URL</label>
                <input
                  type="text"
                  placeholder="https://github.com/..."
                  value={skillUrl}
                  onChange={(e) => onSkillUrlChange(e.target.value)}
                  disabled={skillDownloading}
                  className="rounded-lg border border-ink-900/10 bg-surface-secondary px-3 py-2 text-xs text-ink-800 placeholder-ink-400 focus:border-accent/50 focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-ink-700">Skill Name (optional)</label>
                <input
                  type="text"
                  placeholder="my-skill"
                  value={skillName}
                  onChange={(e) => onSkillNameChange(e.target.value)}
                  disabled={skillDownloading}
                  className="rounded-lg border border-ink-900/10 bg-surface-secondary px-3 py-2 text-xs text-ink-800 placeholder-ink-400 focus:border-accent/50 focus:outline-none disabled:opacity-50"
                />
              </div>

              {skillDownloadError && (
                <div className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
                  {skillDownloadError}
                </div>
              )}

              <button
                onClick={onDownload}
                disabled={skillDownloading || !skillUrl.trim()}
                className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {skillDownloading ? "Downloading..." : "Download"}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
