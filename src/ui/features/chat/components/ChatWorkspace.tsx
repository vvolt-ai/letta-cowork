import { memo, useMemo, useState } from "react";
import type { ClientEvent } from "../../../types";
import { useAppStore } from "../../../store/useAppStore";
import type { AgentDisplayStatus, ReasoningStep, ToolExecution } from "../../../store/useAppStore";
import type { IndexedMessage } from "../../../hooks/useMessageWindow";
import { PromptInput } from "./PromptInput";
import { ConversationHeader } from "./ConversationHeader";
import { ChatTimeline } from "./ChatTimeline";

interface ChatWorkspaceProps {
  title?: string;
  agentName?: string;
  agentId?: string;
  activeSessionId: string | null;
  visibleMessages: IndexedMessage[];
  hasNewMessages: boolean;
  shouldAutoScroll: boolean;
  agentStatus: AgentDisplayStatus;
  partialMessage: string;
  showPartialMessage: boolean;
  partialReasoning: string;
  isHistoryLoading: boolean;
  hasMoreHistory: boolean;
  reasoningSteps: ReasoningStep[];
  toolExecutions: ToolExecution[];
  cliResults: any[];
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
  agentId,
  activeSessionId,
  visibleMessages,
  hasNewMessages,
  shouldAutoScroll,
  agentStatus,
  partialMessage,
  showPartialMessage,
  partialReasoning,
  isHistoryLoading,
  hasMoreHistory,
  reasoningSteps,
  toolExecutions,
  cliResults,
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
  const activeSession = useAppStore((state) => (activeSessionId ? state.sessions[activeSessionId] : undefined));
  const showReasoningInChat = useAppStore((state) => state.showReasoningInChat);
  const errorMessage = activeSession?.ephemeral?.errorMessage;
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const [isCancellingRecoveredRun, setIsCancellingRecoveredRun] = useState(false);

  const recoveredRequests = useMemo(
    () => (activeSession?.permissionRequests ?? []).filter((request) => request.source === "recovered"),
    [activeSession?.permissionRequests]
  );
  const recoveredRunId = recoveredRequests[0]?.runId;

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
        agentId={agentId}
        sessionId={activeSessionId ?? undefined}
        status={agentStatus}
        activityOpen={activityOpen}
        onToggleActivity={onToggleActivity}
      />

      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-white"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-6">
          <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-gray-50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Status</div>
                <div className="mt-1 font-medium text-ink-800">{statusCopy}</div>
              </div>
              <div className="flex items-center gap-2">
                {recoveredRunId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!recoveredRunId || isCancellingRecoveredRun) return;
                      setIsCancellingRecoveredRun(true);
                      void window.electron.cancelStuckRun(recoveredRunId)
                        .then(() => {
                          setGlobalError("Recovered stuck run cancelled. You can now retry the conversation.");
                        })
                        .catch((error) => {
                          console.error("Failed to cancel recovered stuck run", error);
                          setGlobalError(`Failed to cancel stuck run: ${String(error)}`);
                        })
                        .finally(() => {
                          setIsCancellingRecoveredRun(false);
                        });
                    }}
                    className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 text-[11px] font-medium text-orange-700 transition hover:border-orange-400 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
                    disabled={isCancellingRecoveredRun}
                  >
                    {isCancellingRecoveredRun ? "Cancelling stuck run…" : "Cancel stuck run"}
                  </button>
                ) : null}
                {onOpenMemory ? (
                  <button
                    type="button"
                    onClick={onOpenMemory}
                    className="rounded-full border border-[var(--color-border)] bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-ink-700 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
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
          {agentStatus === "error" && errorMessage ? (
            <div className="mb-4 rounded-2xl border border-[var(--color-status-error)]/30 bg-[var(--color-status-error)]/5 px-4 py-3 text-sm text-[var(--color-status-error)]">
              <div className="flex items-start gap-2">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <div>
                  <div className="font-medium">Agent error</div>
                  <div className="mt-0.5 text-xs leading-5 opacity-90">{errorMessage}</div>
                </div>
              </div>
            </div>
          ) : null}

          {recoveredRequests.length > 0 ? (
            <div className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              <div className="font-medium">Recovered pending approval detected</div>
              <div className="mt-1 text-xs text-orange-700">
                This conversation has a Letta run that appears to still be waiting for approval after reconnect. You can inspect it in the activity panel or cancel the stuck run.
              </div>
            </div>
          ) : null}

          {activeSessionId && (hasMoreHistory || (isHistoryLoading && visibleMessages.length > 0)) ? (
            <div className="mb-4 flex justify-center">
              <button
                onClick={onLoadMoreHistory}
                disabled={isHistoryLoading}
                className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-medium text-ink-700 transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
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
              agentStatus={agentStatus}
              partialMessage={partialMessage}
              showPartialMessage={showPartialMessage}
              partialReasoning={partialReasoning}
              reasoningSteps={reasoningSteps}
              toolExecutions={toolExecutions}
              cliResults={cliResults}
              showReasoning={showReasoningInChat}
              errorMessage={agentStatus === "error" ? errorMessage : undefined}
            />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] bg-white px-2 py-2">
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
              : "border border-[var(--color-border)] bg-white text-ink-700 hover:bg-gray-50"
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
