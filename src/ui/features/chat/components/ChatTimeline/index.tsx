/**
 * Main ChatTimeline component
 * Displays a timeline of conversation messages, tool executions, and reasoning
 */

import type { ChatTimelineProps } from "../../types";
import { useChatTimeline } from "./hooks/useChatTimeline";
import { TimelineMessage } from "./TimelineMessage";
import { TimelineLoading } from "./TimelineLoading";
import { AssistantMessage } from "../AssistantMessage";

export type { ChatTimelineProps, TimelineEntry } from "../../types";

export function ChatTimeline({
  messages,
  activeSessionId,
  agentName,
  agentStatus = "idle",
  partialMessage,
  showPartialMessage,
  partialReasoning = "",
  reasoningSteps = [],
  toolExecutions = [],
  cliResults = [],
  showReasoning = false,
  errorMessage,
}: ChatTimelineProps) {
  const timeline = useChatTimeline({
    messages,
    activeSessionId,
    partialReasoning,
    reasoningSteps,
    showReasoning,
    toolExecutions,
    cliResults,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {timeline.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted">
          Start a conversation to see reasoning, tool activity, and results here.
        </div>
      ) : (
        timeline.map((entry) => (
          <TimelineMessage key={entry.id} entry={entry} agentName={agentName} />
        ))
      )}

      {showPartialMessage ? (
        <AssistantMessage
          key="assistant-partial"
          fallbackText={partialMessage}
          agentName={agentName}
          isStreaming
        />
      ) : null}

      {/* Show loading indicator when agent is processing but no partial message yet */}
      {!showPartialMessage && (
        <TimelineLoading agentName={agentName} agentStatus={agentStatus} />
      )}

      {errorMessage ? (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-status-error)]/25 bg-[var(--color-status-error)]/5 px-4 py-3 text-sm">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-status-error)]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div>
            <div className="font-medium text-[var(--color-status-error)]">Agent error</div>
            <div className="mt-0.5 text-xs leading-5 text-[var(--color-status-error)]/80">{errorMessage}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
