/**
 * Main ChatTimeline component
 * Displays a timeline of conversation messages, tool executions, and reasoning
 */

import { useCallback, useEffect, useState } from "react";
import type { ChatTimelineProps } from "../../types";
import { useChatTimeline } from "./hooks/useChatTimeline";
import { TimelineMessage } from "./TimelineMessage";
import { TimelineLoading } from "./TimelineLoading";
import { AssistantMessage } from "../AssistantMessage";
import { AgentDropdown } from "../AgentDropdown";
import { useAppStore } from "../../../../store/useAppStore";

export type { ChatTimelineProps, TimelineEntry } from "../../types";

function NewConversationAgentSelector() {
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [savingAgentId, setSavingAgentId] = useState(false);
  const setGlobalError = useAppStore((state) => state.setGlobalError);

  useEffect(() => {
    let cancelled = false;
    window.electron.getLettaEnv()
      .then((env) => {
        if (cancelled) return;
        setSelectedAgentId(env.LETTA_AGENT_ID?.trim() ?? "");
      })
      .catch((error) => {
        console.error("Failed to load Letta environment:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAgentChange = useCallback(async (agentId: string) => {
    const trimmedAgentId = agentId.trim();
    if (!trimmedAgentId) return;

    setSavingAgentId(true);
    setSelectedAgentId(trimmedAgentId);
    try {
      const currentEnv = await window.electron.getLettaEnv();
      await window.electron.updateLettaEnv({
        ...currentEnv,
        LETTA_AGENT_ID: trimmedAgentId,
      });
      setGlobalError(null);
    } catch (error) {
      console.error("Failed to select agent for new conversation:", error);
      setGlobalError("Failed to select agent for the new conversation.");
    } finally {
      setSavingAgentId(false);
    }
  }, [setGlobalError]);

  return (
    <div className="mt-6 text-left">
      <AgentDropdown
        value={selectedAgentId}
        onChange={handleAgentChange}
        disabled={savingAgentId}
      />
      <p className="mt-2 text-xs leading-5 text-muted">
        The first message will start a new conversation with this agent.
      </p>
    </div>
  );
}

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
    agentStatus,
  });

  const lastCommittedAssistant = [...messages].reverse().find((item) => item.message.type === "assistant");
  const committedAssistantText = lastCommittedAssistant && "content" in lastCommittedAssistant.message
    ? String((lastCommittedAssistant.message as { content?: string }).content ?? "").trim()
    : "";
  const streamingAssistantText = String(partialMessage ?? "").trim();
  const shouldRenderPartialMessage = showPartialMessage
    && streamingAssistantText.length > 0
    && streamingAssistantText !== committedAssistantText;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[920px] flex-col gap-2 overflow-hidden">
      {timeline.length === 0 ? (
        <div className="mx-auto my-20 max-w-md px-8 py-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-ink-900">Start a conversation</div>
          <div className="mt-1.5 text-sm leading-6 text-muted">Ask for work, upload files, or use slash commands. Reasoning and tool activity will stay compact here.</div>
          {!activeSessionId ? <NewConversationAgentSelector /> : null}
        </div>
      ) : (
        timeline.map((entry) => (
          <TimelineMessage key={entry.id} entry={entry} agentName={agentName} />
        ))
      )}

      {shouldRenderPartialMessage ? (
        <AssistantMessage
          key="assistant-partial"
          fallbackText={partialMessage}
          agentName={agentName}
          isStreaming
        />
      ) : null}

      {/* Show loading indicator when agent is processing but no partial message yet */}
      {!shouldRenderPartialMessage && (
        <TimelineLoading agentName={agentName} agentStatus={agentStatus} />
      )}

      {errorMessage ? (
        <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-[var(--color-status-error)]/25 bg-[var(--color-status-error)]/5 px-4 py-3 text-sm">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-status-error)]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div className="min-w-0 break-words">
            <div className="font-medium text-[var(--color-status-error)]">Agent error</div>
            <div className="mt-0.5 text-xs leading-5 text-[var(--color-status-error)]/80">{errorMessage}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
