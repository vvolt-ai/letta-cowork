import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

interface SendToAgentConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (additionalInstructions?: string) => void;
  emailSubject?: string;
}

/**
 * Confirmation modal for Send to Agent action
 * Allows user to optionally add additional instructions before sending
 */
export function SendToAgentConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  emailSubject,
}: SendToAgentConfirmationModalProps) {
  const [additionalInstructions, setAdditionalInstructions] = useState("");

  const handleConfirm = () => {
    const trimmedInstructions = additionalInstructions.trim();
    onConfirm(trimmedInstructions || undefined);
    setAdditionalInstructions("");
    onOpenChange(false);
  };

  const handleCancel = () => {
    setAdditionalInstructions("");
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-ink-900">
            Send to Agent
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted">
            {emailSubject
              ? `Send "${emailSubject.slice(0, 50)}${emailSubject.length > 50 ? "..." : ""}" to the selected agent for processing.`
              : "Send this email to the selected agent for processing."}
          </Dialog.Description>

          <div className="mt-4">
            <label className="block text-sm font-medium text-ink-700 mb-1">
              Additional Instructions <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              placeholder="e.g., Focus on the procurement details, summarize action items..."
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent min-h-[80px] resize-none"
              rows={3}
            />
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Send
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
