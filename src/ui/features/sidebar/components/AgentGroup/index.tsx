import { useEffect, useState } from "react";

import { ConversationList } from "../ConversationList";

import type { SessionView } from "../../../../store/useAppStore";

type SidebarSessionSummary = Pick<
  SessionView,
  "id" | "title" | "status" | "updatedAt" | "createdAt" | "lastPrompt" | "isEmailSession" | "agentId" | "agentName"
>;

interface AgentGroupProps {
  agentId: string | undefined;
  agentName: string | undefined;
  agentDescription?: string;
  sessions: SidebarSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onNewSession?: (agentId?: string) => void;
}

// Generate a consistent color for each agent based on name
function agentColor(name: string): string {
  const colors = [
    "#5C6BC0", "#26A69A", "#EF5350", "#AB47BC",
    "#42A5F5", "#FF7043", "#66BB6A", "#FFA726",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function AgentGroup({
  agentId,
  agentName,
  agentDescription,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onResumeSession,
  onRenameSession,
  onNewSession,
}: AgentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasActiveSession = sessions.some((s) => s.id === activeSessionId);

  useEffect(() => {
    if (hasActiveSession) setIsExpanded(true);
  }, [hasActiveSession]);

  const displayName = agentName || "Unknown Agent";
  const dotColor = agentColor(displayName);

  return (
    <div className="mb-3 px-1">
      {/* Agent Header */}
      <div className="group flex items-center justify-between gap-2 px-3 py-1.5">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left"
        >
          <svg viewBox="0 0 24 24" className={`h-3 w-3 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
          {/* Status dot */}
          <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          </span>

          {/* Agent name + description */}
          <div className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold leading-tight text-ink-900">
              {displayName}
            </span>
            {agentDescription && (
              <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-muted">
                {agentDescription}
              </span>
            )}
          </div>
        </button>

        {/* New conversation pencil icon */}
        {onNewSession && (
          <button
            onClick={(e) => { e.stopPropagation(); onNewSession(agentId); }}
            className="shrink-0 rounded-full p-1 text-muted opacity-0 transition hover:bg-[var(--color-surface-hover)] hover:text-ink-700 hover:shadow-sm group-hover:opacity-100"
            title="New conversation"
            aria-label="New conversation"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Conversations */}
      {isExpanded && (
        <ConversationList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onResumeSession={onResumeSession}
          onRenameSession={onRenameSession}
          emptyMessage=""
          maxVisible={4}
        />
      )}
    </div>
  );
}

export default AgentGroup;
