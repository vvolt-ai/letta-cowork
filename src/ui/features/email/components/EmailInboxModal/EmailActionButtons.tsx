import type { ZohoEmail } from "../../../../types";
import type { ProcessedEmailData } from "../../types";

interface EmailActionButtonsProps {
  email: ZohoEmail;
  isProcessingEmailInput?: boolean;
  selectedAgentId?: string;
  processingEmailId?: string | null;
  successEmailId?: string | null;
  isProcessed: boolean;
  conversationId: string | null;
  agentId?: string;
  processedEmailsFromServer: Map<string, ProcessedEmailData>;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  onProcessEmailToAgent: (email: ZohoEmail, agentId: string) => void;
  onViewConversation: (conversationId: string) => void;
  onOpenInLetta: (conversationId: string, agentId?: string) => void;
}

/**
 * Action buttons for email preview - Use in Chat, Send to Agent, View Conversation
 */
export function EmailActionButtons({
  email,
  isProcessingEmailInput,
  selectedAgentId,
  processingEmailId,
  successEmailId,
  isProcessed,
  conversationId,
  agentId,
  onUseEmailAsInput,
  onProcessEmailToAgent,
  onViewConversation,
  onOpenInLetta,
}: EmailActionButtonsProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Use in Chat button */}
      <button
        onClick={() => onUseEmailAsInput(email)}
        disabled={isProcessingEmailInput}
        className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-gray-50 disabled:opacity-50"
        title="Use email as chat input"
      >
        💬 Use in Chat
      </button>

      {/* Processed email actions or Send to Agent button */}
      {selectedAgentId && (
        isProcessed && conversationId ? (
          <>
            <button
              onClick={() => onViewConversation(conversationId)}
              className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover"
              title="View conversation"
            >
              👁 View Conversation
            </button>
            {agentId && (
              <button
                onClick={() => onOpenInLetta(conversationId, agentId)}
                className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-medium text-ink-700 hover:bg-gray-50"
                title="Open in Letta"
              >
                Open in Letta
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onProcessEmailToAgent(email, selectedAgentId)}
            disabled={!!processingEmailId}
            className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 min-w-[100px]"
            title="Process email to agent"
          >
            {String(successEmailId) === String(email.messageId) ? (
              "✓ Sent!"
            ) : String(processingEmailId) === String(email.messageId) ? (
              <span className="flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                Processing...
              </span>
            ) : (
              "→ Send to Agent"
            )}
          </button>
        )
      )}
    </div>
  );
}
