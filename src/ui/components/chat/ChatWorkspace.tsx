import { memo } from "react";
import type { ClientEvent } from "../../types";
import type { AgentDisplayStatus, ReasoningStep, ToolExecution } from "../../store/useAppStore";
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
  hasMoreHistory: boolean;
  reasoningSteps: ReasoningStep[];
  toolExecutions: ToolExecution[];
  onScroll: () => void;
  onScrollToBottom: () => void;
  onSendMessage: () => void;
  onLoadMoreHistory: () => void;
  sendEvent: (event: ClientEvent) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onOpenMemory?: () => void;
}

export const ChatWorkspace = memo(function ChatWorkspace({
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
  hasMoreHistory,
  reasoningSteps,
  toolExecutions,
  onScroll,
  onScrollToBottom,
  onSendMessage,
  onLoadMoreHistory,
  sendEvent,
  scrollContainerRef,
  messagesEndRef,
  activityOpen,
  onToggleActivity,
  onOpenMemory,
}: ChatWorkspaceProps) {
  const resolvedTitle = title || "Untitled conversation";
  const resolvedAgentName = agentName || "Vera";

  const statusCopy = {
    idle: "Ready for your next prompt",
    thinking: `${resolvedAgentName} is thinking`,
    running_tool: `${resolvedAgentName} is running a tool`,
    waiting_approval: `${resolvedAgentName} is waiting for approval`,
    generating: `${resolvedAgentName} is writing a response`,
    completed: "Last response completed",
    error: "Something went wrong in the last run",
  }[agentStatus];

  return (
    <section className="relative flex h-full flex-1 flex-col">
      <ConversationHeader
        title={resolvedTitle}
        agentName={resolvedAgentName}
        status={agentStatus}
        activityOpen={activityOpen}
        onToggleActivity={onToggleActivity}
      />

      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-[var(--color-bg-100)]"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Status</div>
                <div className="mt-1 font-medium text-ink-800">{statusCopy}</div>
              </div>
              <div className="flex items-center gap-2">
                {onOpenMemory ? (
                  <button
                    type="button"
                    onClick={onOpenMemory}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-[11px] font-medium text-ink-700 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                  >
                    Memory
                  </button>
                ) : null}
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  agentStatus === "error"
                    ? "bg-[var(--color-status-error)]/10 text-[var(--color-status-error)]"
                    : agentStatus === "completed"
                      ? "bg-[var(--color-status-completed)]/10 text-[var(--color-status-completed)]"
                      : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                }`}>
                  {agentStatus.replace("_", " ")}
                </span>
              </div>
            </div>
          </div>
          {activeSessionId && (hasMoreHistory || (isHistoryLoading && visibleMessages.length > 0)) ? (
            <div className="mb-4 flex justify-center">
              <button
                onClick={onLoadMoreHistory}
                disabled={isHistoryLoading}
                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-ink-700 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isHistoryLoading ? "Loading earlier messages…" : "Load more messages"}
              </button>
            </div>
          ) : null}

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
              toolExecutions={toolExecutions}
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
          onOpenMemory={onOpenMemory}
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
});
