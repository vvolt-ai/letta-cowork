import type { ZohoEmail } from "../../../../types";
import type { ProcessedEmailData } from "../../types";
import { extractContent, isHtmlContent } from "../../types";
import { EmailActionButtons } from "./EmailActionButtons";

interface EmailPreviewProps {
  email: ZohoEmail;
  localEmailDetails: unknown;
  localEmailDetailsError: string | null;
  isFetchingLocalContent: boolean;
  processingEmailId?: string | null;
  successEmailId?: string | null;
  isProcessingEmailInput?: boolean;
  selectedAgentId?: string;
  processedEmailsFromServer: Map<string, ProcessedEmailData>;
  isEmailProcessed: boolean;
  conversationId: string | null;
  onUseEmailAsInput: (email: ZohoEmail) => void;
  onProcessEmailToAgent: (email: ZohoEmail, agentId: string) => void;
  onViewConversation: (conversationId: string) => void;
  onOpenInLetta: (conversationId: string, agentId?: string) => void;
}

/**
 * Email preview panel showing email details and content
 */
export function EmailPreview({
  email,
  localEmailDetails,
  localEmailDetailsError,
  isFetchingLocalContent,
  processingEmailId,
  successEmailId,
  isProcessingEmailInput,
  selectedAgentId,
  processedEmailsFromServer,
  isEmailProcessed,
  conversationId,
  onUseEmailAsInput,
  onProcessEmailToAgent,
  onViewConversation,
  onOpenInLetta,
}: EmailPreviewProps) {
  // Extract content for preview
  const content = extractContent(localEmailDetails);
  const html = isHtmlContent(content);

  // Get agentId from server data or session
  const messageId = String(email.messageId);
  
  return (
    <>
      {/* Email Header */}
      <div className="px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900 truncate">
              {email.subject || "(No subject)"}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className="font-medium text-ink-700">
                {email.sender || email.fromAddress}
              </span>
              {email.toAddress && (
                <>
                  <span>→</span>
                  <span>{email.toAddress}</span>
                </>
              )}
              <span className="ml-auto">
                {new Date(Number(email.receivedTime)).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <EmailActionButtons
            email={email}
            isProcessingEmailInput={isProcessingEmailInput}
            selectedAgentId={selectedAgentId}
            processingEmailId={processingEmailId}
            successEmailId={successEmailId}
            isProcessed={isEmailProcessed}
            conversationId={conversationId}
            agentId={processedEmailsFromServer.get(messageId)?.agentId}
            processedEmailsFromServer={processedEmailsFromServer}
            onUseEmailAsInput={onUseEmailAsInput}
            onProcessEmailToAgent={onProcessEmailToAgent}
            onViewConversation={onViewConversation}
            onOpenInLetta={onOpenInLetta}
          />
        </div>
      </div>

      {/* Processing Status */}
      {String(processingEmailId) === String(email.messageId) && (
        <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            <div className="flex flex-col gap-1">
              <span className="font-medium">Processing email...</span>
              <div className="flex items-center gap-1 text-blue-500">
                <span>Fetching content</span>
                <span>→</span>
                <span>Creating conversation</span>
                <span>→</span>
                <span>Sending to agent</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Content */}
      <div className="flex-1 overflow-auto p-3">
        {isFetchingLocalContent ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted">
            Loading email content…
          </div>
        ) : localEmailDetailsError ? (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {localEmailDetailsError}
          </div>
        ) : html ? (
          <iframe
            title="Email content"
            className="w-full h-full min-h-[400px] rounded-lg border border-[var(--color-border)]"
            sandbox=""
            srcDoc={content}
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            {content || email.summary || (
              <div className="text-center text-muted py-8">
                No content available
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
