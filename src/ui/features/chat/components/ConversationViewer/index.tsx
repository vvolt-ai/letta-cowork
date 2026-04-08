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
  const showPartialMessage = agentStatus === "generating" && partialMessage.length > 0;
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
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border)] bg-white">
        {showBackButton && onBack && (
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-gray-100"
            title="Back"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-ink-900 truncate">
            {session?.title || "Conversation"}
          </h2>
          <div className="text-xs text-muted">
            {session?.agentName || "Agent"}
          </div>
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
            className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 flex items-center gap-1"
            title="Open in Letta"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        className="flex-1 overflow-auto bg-white"
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
      <div className="border-t border-[var(--color-border)] bg-white px-2 py-2">
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
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    idle: { bg: "bg-gray-100", text: "text-gray-700", label: "Idle" },
    thinking: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Thinking..." },
    running_tool: { bg: "bg-blue-100", text: "text-blue-700", label: "Running Tool" },
    waiting_approval: { bg: "bg-orange-100", text: "text-orange-700", label: "Waiting Approval" },
    generating: { bg: "bg-blue-100", text: "text-blue-700", label: "Generating..." },
    completed: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
    error: { bg: "bg-red-100", text: "text-red-700", label: "Error" },
  };
  const config = statusConfig[status] || statusConfig.idle;
  
  return (
    <span className={`text-xs ${config.bg} ${config.text} px-2 py-1 rounded-full`}>
      {config.label}
    </span>
  );
}
