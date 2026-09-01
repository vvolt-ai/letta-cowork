/**
 * Main ChatTimeline component
 * Displays a timeline of conversation messages, tool executions, and reasoning
 */

import { useCallback, useEffect, useState } from "react";

import { useChatTimeline } from "./hooks/useChatTimeline";
import { TimelineLoading } from "./TimelineLoading";
import { TimelineMessage } from "./TimelineMessage";
import { useAppStore } from "../../../../store/useAppStore";
import { AgentDropdown } from "../AgentDropdown";
import { AssistantMessage } from "../AssistantMessage";

import type { ChatTimelineProps } from "../../types";

export type { ChatTimelineProps, TimelineEntry } from "../../types";

type ConversationOption = {
  id: string;
  agentId: string;
  summary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  model?: string | null;
};

const NEW_CONVERSATION_VALUE = "__new_conversation__";

function parseConversationDate(timestamp?: string | null): number | undefined {
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatConversationDate(timestamp?: string | null): string {
  const parsed = parseConversationDate(timestamp);
  if (parsed === undefined) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function NewConversationAgentSelector() {
  const selectedAgentId = useAppStore((state) => state.newConversationAgentId);
  const setSelectedAgentId = useAppStore((state) => state.setNewConversationAgentId);
  const [selectedConversationId, setSelectedConversationId] = useState(NEW_CONVERSATION_VALUE);
  const [conversations, setConversations] = useState<ConversationOption[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [savingAgentId, setSavingAgentId] = useState(false);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const openExistingConversation = useAppStore((state) => state.openExistingConversation);

  useEffect(() => {
    let cancelled = false;
    window.electron.getLettaEnv()
      .then((env) => {
        if (cancelled) return;
        if (!useAppStore.getState().newConversationAgentId) {
          setSelectedAgentId(env.LETTA_AGENT_ID?.trim() ?? "");
        }
      })
      .catch((error) => {
        console.error("Failed to load Letta environment:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [setSelectedAgentId]);

  useEffect(() => {
    let cancelled = false;
    const agentId = selectedAgentId.trim();

    setSelectedConversationId(NEW_CONVERSATION_VALUE);
    setConversations([]);
    setConversationsError(null);

    if (!agentId) {
      setConversationsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setConversationsLoading(true);
    window.electron.listLettaConversations(agentId)
      .then((items) => {
        if (!cancelled) setConversations(items ?? []);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load conversations for new-chat selector:", error);
        setConversationsError("Could not load conversations for this agent.");
      })
      .finally(() => {
        if (!cancelled) setConversationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

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

  const handleConversationChange = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    if (conversationId === NEW_CONVERSATION_VALUE) return;

    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    openExistingConversation({
      id: conversation.id,
      title: conversation.summary?.trim() || conversation.id,
      agentId: conversation.agentId || selectedAgentId,
      model: conversation.model?.trim() || undefined,
      createdAt: parseConversationDate(conversation.createdAt),
      updatedAt: parseConversationDate(conversation.lastMessageAt ?? conversation.updatedAt),
    });
  }, [conversations, openExistingConversation, selectedAgentId]);

  return (
    <div className="mt-6 grid gap-4 text-left">
      <div>
        <AgentDropdown
          value={selectedAgentId}
          onChange={handleAgentChange}
          disabled={savingAgentId}
        />
      </div>

      <label className="grid min-w-0 gap-1.5">
        <span className="text-xs text-ink-700">Conversation</span>
        <select
          className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none transition focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
          value={selectedConversationId}
          onChange={(event) => handleConversationChange(event.target.value)}
          disabled={!selectedAgentId.trim() || conversationsLoading}
        >
          <option value={NEW_CONVERSATION_VALUE}>
            {selectedAgentId.trim() ? "New conversation" : "Select an agent first"}
          </option>
          {conversations.map((conversation) => {
            const summary = conversation.summary?.trim();
            const label = summary && summary !== conversation.id
              ? `${summary} — ${conversation.id}`
              : conversation.id;
            const metadata = [
              formatConversationDate(conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt),
              conversation.model,
            ].filter(Boolean).join(" • ");
            return (
              <option key={conversation.id} value={conversation.id}>
                {metadata ? `${label} — ${metadata}` : label}
              </option>
            );
          })}
        </select>
        {conversationsLoading ? (
          <span className="text-xs leading-5 text-muted">Loading existing conversations…</span>
        ) : conversationsError ? (
          <span className="text-xs leading-5 text-[var(--color-status-error)]">{conversationsError}</span>
        ) : (
          <span className="text-xs leading-5 text-muted">
            New conversation is selected by default. Choose an existing one to continue it.
          </span>
        )}
      </label>
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
