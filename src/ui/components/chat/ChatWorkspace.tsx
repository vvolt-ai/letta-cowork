import type { ClientEvent } from "../../types";
import type { AgentDisplayStatus, ReasoningStep } from "../../store/useAppStore";
import type { IndexedMessage } from "../../hooks/useMessageWindow";
import { PromptInput } from "../PromptInput";
import { ConversationHeader } from "./ConversationHeader";
import { ChatTimeline } from "./ChatTimeline";

interface ChatWorkspaceProps {
  title?: string;
  agentName?: string;
  activeSessionId: string | null;
  visibleMessages: IndexedMessage[];
  hasNewMessages: boolean;
  shouldAutoScroll: boolean;
  agentStatus: AgentDisplayStatus;
  partialMessage: string;
  showPartialMessage: boolean;
  isHistoryLoading: boolean;
  reasoningSteps: ReasoningStep[];
  onScroll: () => void;
  onScrollToBottom: () => void;
  onSendMessage: () => void;
  sendEvent: (event: ClientEvent) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

export function ChatWorkspace({
  title,
  agentName,
  activeSessionId,
  visibleMessages,
  hasNewMessages,
  shouldAutoScroll,
  agentStatus,
  partialMessage,
  showPartialMessage,
  isHistoryLoading,
  reasoningSteps,
  onScroll,
  onScrollToBottom,
  onSendMessage,
  sendEvent,
  scrollContainerRef,
  messagesEndRef,
}: ChatWorkspaceProps) {
  const resolvedTitle = title || "Untitled conversation";
  const resolvedAgentName = agentName || "Vera";

  return (
    <section className="relative flex h-full flex-1 flex-col">
      <ConversationHeader title={resolvedTitle} agentName={resolvedAgentName} status={agentStatus} />

      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-[var(--color-bg-100)]"
      >
        <div className="px-6 py-8">
          {isHistoryLoading && visibleMessages.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <svg className="h-6 w-6 animate-spin text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle className="opacity-20" cx="12" cy="12" r="10" />
                  <path d="M4 12a8 8 0 018-8" />
                </svg>
                <p className="text-sm font-medium text-ink-700">Loading conversation…</p>
                <p className="text-xs text-muted max-w-sm">
                  Fetching previous messages so you can pick up right where you left off.
                </p>
              </div>
            </div>
          ) : (
            <ChatTimeline
              messages={visibleMessages}
              activeSessionId={activeSessionId}
              agentName={resolvedAgentName}
              partialMessage={partialMessage}
              showPartialMessage={showPartialMessage}
              reasoningSteps={reasoningSteps}
            />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4">
        <PromptInput
          sendEvent={sendEvent}
          onSendMessage={onSendMessage}
          disabled={agentStatus === "waiting_approval"}
        />
      </div>

      {!shouldAutoScroll && (
        <button
          onClick={onScrollToBottom}
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 152px)" }}
          className={`pointer-events-auto absolute right-6 z-40 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm transition lg:right-12 ${
            hasNewMessages
              ? "border border-[var(--color-accent)] bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-700 hover:bg-[var(--color-surface-tertiary)]"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 ${hasNewMessages ? "text-white" : "text-[var(--color-accent)]"}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>{hasNewMessages ? "New messages" : "Scroll to bottom"}</span>
        </button>
      )}
    </section>
  );
}
