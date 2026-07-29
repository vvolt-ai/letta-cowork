import { memo, useEffect, useRef } from "react";
import { useAppStore } from "../../../../store/useAppStore";
import { useShallow } from "zustand/react/shallow";
import { ChatTimeline } from "../ChatTimeline";
import { PromptInput } from "../PromptInput";
import { useMessageWindow } from "../../../../hooks/useMessageWindow";

interface ConversationViewerProps {
  sessionId: string;
  onBack?: () => void;
  showBackButton?: boolean;
  showOpenInLetta?: boolean;
  fullWidthComposer?: boolean;
}

export const ConversationViewer = memo(function ConversationViewer({
  sessionId,
  onBack,
  showBackButton = false,
  showOpenInLetta = true,
  fullWidthComposer = false,
}: ConversationViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get session data from store
  const session = useAppStore(useShallow((state) => state.sessions[sessionId]));
  const sendEvent = useAppStore((state) => state.ipcSendEvent);

  const messages = session?.messages ?? [];
  const shouldAutoScroll = true;

  // Use message window hook to get visible messages
  const { visibleMessages } = useMessageWindow(
    messages,
    sessionId,
    messagesEndRef,
    shouldAutoScroll
  );

  const handleScroll = () => {};
  
  // Fetch history if not hydrated
  useEffect(() => {
    if (session && !session.hydrated && !session.isLoadingHistory && sendEvent) {
      sendEvent({
        type: "session.history",
        payload: { sessionId }
      });
    }
  }, [sessionId, session, sendEvent]);
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [shouldAutoScroll, visibleMessages]);
  
  // Get agent status and ephemeral state
  const showReasoningInChat = useAppStore((state) => state.showReasoningInChat);
  const agentStatus = session?.ephemeral?.status || "idle";
  const partialMessage = session?.ephemeral?.assistantDraft?.content 
    ? (typeof session.ephemeral.assistantDraft.content === "string" 
        ? session.ephemeral.assistantDraft.content 
        : "")
    : "";
  const showPartialMessage = partialMessage.length > 0 && agentStatus !== "completed" && agentStatus !== "idle";
  const reasoningSteps = session?.ephemeral?.reasoning || [];
  const toolExecutions = session?.ephemeral?.tools || [];
  const errorMessage = session?.ephemeral?.errorMessage;
  
  // Handle send message
  // const handleSendMessage = () => {
  //   const prompt = useAppStore.getState().prompt;
  //   if (!prompt.trim() || !sendEvent) return;
    
  //   sendEvent({
  //     type: "session.continue",
  //     payload: {
  //       sessionId,
  //       prompt: prompt.trim(),
  //     },
  //   });
    
  //   // Clear prompt
  //   useAppStore.getState().setPrompt("");
  // };
  
  const isProcessing = ["thinking", "running_tool", "generating", "waiting_approval"].includes(agentStatus);
  
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-[var(--color-bg-000)]">
      {/* Header */}
      <div className="flex min-h-16 min-w-0 shrink-0 items-center gap-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur-md sm:gap-3 sm:px-5">
        {showBackButton && onBack && (
          <button
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] text-ink-500 transition hover:bg-[var(--color-surface-secondary)] hover:text-ink-900"
            title="Back"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">Agent conversation</div>
          <h2 className="truncate text-sm font-semibold tracking-tight text-ink-900">
            {session?.title || "Conversation"}
          </h2>
          <div className="mt-0.5 truncate text-[10px] text-muted">{session?.agentName || "Agent"}</div>
        </div>

        {/* Status Badge */}
        <StatusBadge status={agentStatus} />

        {/* Open in Letta Button */}
        {showOpenInLetta && session?.agentId && (
          <button
            onClick={() => {
              const lettaUrl = `https://app.letta.com/projects/default-project/agents/${session.agentId}?conversation=${sessionId}`;
              window.electron.openExternal(lettaUrl);
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-000)] px-2.5 text-[11px] font-semibold text-ink-600 transition hover:bg-[var(--color-surface-secondary)] hover:text-ink-900 sm:px-3"
            title="Open in Letta"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open in Letta
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-[var(--color-bg-000)] px-4 py-3 sm:px-5 sm:py-4"
        onScroll={handleScroll}
      >
        <ChatTimeline
          messages={visibleMessages}
          activeSessionId={sessionId}
          agentName={session?.agentName || "Agent"}
          agentStatus={agentStatus}
          partialMessage={partialMessage}
          showPartialMessage={showPartialMessage}
          reasoningSteps={reasoningSteps}
          toolExecutions={toolExecutions}
          showReasoning={showReasoningInChat}
          errorMessage={agentStatus === "error" ? errorMessage : undefined}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="min-w-0 shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-3 backdrop-blur-md sm:px-4">
        <PromptInput
          overrideSessionId={sessionId}
          disabled={isProcessing}
          sendEvent={sendEvent!}
          fullWidth={fullWidthComposer}
        />
      </div>
    </div>
  );
});

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    idle: { bg: "bg-[var(--color-surface-secondary)]", text: "text-muted", dot: "bg-ink-400", label: "Idle" },
    thinking: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Thinking" },
    running_tool: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500", label: "Running tool" },
    waiting_approval: { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500", label: "Approval" },
    generating: { bg: "bg-[var(--color-accent-subtle)]", text: "text-[var(--color-accent)]", dot: "bg-[var(--color-accent)]", label: "Responding" },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Completed" },
    error: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500", label: "Error" },
  };
  const config = statusConfig[status] || statusConfig.idle;
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-semibold ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
