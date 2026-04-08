import { useState, useRef, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";

interface ResumeSessionDialogProps {
  open: boolean;
  resumeSessionId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ResumeSessionDialog({
  open,
  resumeSessionId,
  onOpenChange,
}: ResumeSessionDialogProps) {
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCopied(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [resumeSessionId]);

  const handleCopyCommand = async () => {
    if (!resumeSessionId) return;
    const command = `letta --conv ${resumeSessionId}`;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      onOpenChange(false);
    }, 3000);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-ink-800">Resume</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-900/10 bg-surface px-3 py-2 font-mono text-xs text-ink-700">
            <span className="flex-1 break-all">{resumeSessionId ? `letta --conv ${resumeSessionId}` : ""}</span>
            <button className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-900/10" onClick={handleCopyCommand} aria-label="Copy resume command">
              {copied ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l4 4L19 6" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
