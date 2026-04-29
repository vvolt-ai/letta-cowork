import { useState } from "react";
import type { ZohoEmail } from "../../../../types";
import { SendToAgentConfirmationModal } from "./SendToAgentConfirmationModal";

interface EmailActionButtonsProps {
  email: ZohoEmail;
  isProcessingEmailInput?: boolean;
  selectedAgentId?: string;
  processingEmailId?: string | null;
  awaitingConversationEmailId?: string | null;
  errorEmailId?: string | null;
  isProcessed: boolean;
  conversationId: string | null;
  agentId?: string;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  onProcessEmailToAgent: (email: ZohoEmail, agentId: string, additionalInstructions?: string) => void;
  onViewConversation: (conversationId: string) => void;
  onOpenInLetta: (conversationId: string, agentId?: string) => void;
}

/**
 * Action buttons for email preview - Use in Chat, Send to Agent, View Conversation
 * 
 * State flow:
 * 1. Initial: "→ Send to Agent" (clickable)
 * 2. Processing: "⟳ Processing..." (disabled, spinner)
 * 3. Awaiting Conversation: "⟳ Fetching conversation..." (disabled, spinner) 
 * 4. Error: "✗ Failed - Retry" (clickable, red styling)
 * 5. Complete: "👁 View Conversation" button appears
 */
export function EmailActionButtons({
  email,
  isProcessingEmailInput,
  selectedAgentId,
  processingEmailId,
  awaitingConversationEmailId,
  errorEmailId,
  isProcessed,
  conversationId,
  agentId,
  onUseEmailAsInput,
  onProcessEmailToAgent,
  onViewConversation,
  onOpenInLetta,
}: EmailActionButtonsProps) {
  const messageId = String(email.messageId);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // Determine the current state for this email
  const isProcessing = String(processingEmailId) === messageId;
  const isAwaitingConversation = String(awaitingConversationEmailId) === messageId;
  const hasError = String(errorEmailId) === messageId;
  const isButtonDisabled = (isProcessing || isAwaitingConversation) && !hasError;

  const handleSendToAgent = () => {
    setShowConfirmation(true);
  };

  const handleConfirmSend = (additionalInstructions?: string) => {
    onProcessEmailToAgent(email, selectedAgentId!, additionalInstructions);
  };

  return (
    <>
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

        {/* Processed email actions OR Send to Agent button with intermediate states */}
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
              onClick={handleSendToAgent}
              disabled={isButtonDisabled}
              className={`rounded-lg px-2 py-1 text-xs font-medium min-w-[120px] ${
                hasError
                  ? "bg-red-100 text-red-700 border border-red-300 hover:bg-red-200"
                  : "bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              }`}
              title={hasError ? "Failed to process email - click to retry" : "Process email to agent"}
            >
              {hasError ? (
                <span className="flex items-center gap-1">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  Failed - Retry
                </span>
              ) : isAwaitingConversation ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  Fetching...
                </span>
              ) : isProcessing ? (
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

      {/* Confirmation Modal */}
      <SendToAgentConfirmationModal
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        onConfirm={handleConfirmSend}
        emailSubject={email.subject}
      />
    </>
  );
}
