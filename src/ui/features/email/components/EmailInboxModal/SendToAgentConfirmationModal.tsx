import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

import { AgentDropdown } from "../../../chat/components/AgentDropdown";

interface SendToAgentConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (agentId: string, additionalInstructions?: string) => void;
  emailSubject?: string;
  emailUrl?: string;
  /** Default agent — used the very first time, or if the persisted
   *  last-picked agent doesn't exist anymore. */
  defaultAgentId?: string;
}

/** Persists the last agent the user explicitly picked in this modal,
 *  so they don't have to find it in the dropdown every time. */
const LAST_AGENT_STORAGE_KEY = "cowork:send-to-agent:last-agent-id";

function readLastAgentId(): string {
  try {
    return localStorage.getItem(LAST_AGENT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLastAgentId(agentId: string): void {
  try {
    if (agentId) localStorage.setItem(LAST_AGENT_STORAGE_KEY, agentId);
  } catch {
    // localStorage can throw in private mode / quota — ignore.
  }
}

/**
 * Confirmation modal for Send to Agent action.
 *
 * Renders an agent picker so the user can choose which agent should
 * process this email, plus an optional instructions field. The picker
 * defaults to `defaultAgentId` so the existing one-click flow stays
 * fast — change only if you want a different agent.
 */
export function SendToAgentConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  emailSubject,
  emailUrl,
  defaultAgentId,
}: SendToAgentConfirmationModalProps) {
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  // Prefer the persisted last-picked agent; fall back to the global
  // default only when the user has never picked one before.
  const [agentId, setAgentId] = useState<string>(
    () => readLastAgentId() || defaultAgentId || ""
  );

  // On each open, refresh from storage so a pick made elsewhere (or
  // in a previous run) is honoured. Falls back to defaultAgentId only
  // if storage is empty.
  useEffect(() => {
    if (open) {
      setAgentId(readLastAgentId() || defaultAgentId || "");
    }
  }, [open, defaultAgentId]);

  const handleConfirm = () => {
    if (!agentId) return;
    const trimmedInstructions = additionalInstructions.trim();
    writeLastAgentId(agentId);
    onConfirm(agentId, trimmedInstructions || undefined);
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
              ? `Send "${emailSubject.slice(0, 50)}${emailSubject.length > 50 ? "..." : ""}" to the chosen agent for processing.`
              : "Send this email to the chosen agent for processing."}
          </Dialog.Description>

          <div className="mt-2 rounded-md bg-gray-50 px-2 py-1 text-[10px] leading-tight text-muted break-all">
            {emailUrl || "No active Zoho URL"}
          </div>

          <div className="mt-4">
            <AgentDropdown value={agentId} onChange={setAgentId} />
          </div>

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
              disabled={!agentId}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
