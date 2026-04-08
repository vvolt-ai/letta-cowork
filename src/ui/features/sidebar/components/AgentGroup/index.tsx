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
  sessions: SidebarSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSession?: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
}

export function AgentGroup({
  agentId: _agentId,
  agentName,
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onResumeSession,
  onRenameSession,
}: AgentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasActiveSession = sessions.some((s) => s.id === activeSessionId);

  // Auto-expand if there's an active session in this group
  useEffect(() => {
    if (hasActiveSession) {
      setIsExpanded(true);
    }
  }, [hasActiveSession]);

  const displayName = agentName || "Unknown Agent";
  const sessionCount = sessions.length;

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      {/* Agent Header - Click to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition hover:bg-[var(--color-sidebar-hover)] ${
          hasActiveSession ? "bg-[var(--color-sidebar-active)]" : ""
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {/* Expand/Collapse Icon */}
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>

          {/* Agent Avatar/Icon */}
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>

          {/* Agent Name and Count */}
          <div className="min-w-0">
            <span className={`block truncate text-sm font-medium ${hasActiveSession ? "text-ink-900" : "text-ink-700"}`}>
              {displayName}
            </span>
          </div>
        </div>

        {/* Session Count Badge */}
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[11px] font-semibold text-ink-600">
          {sessionCount}
        </span>
      </button>

      {/* Conversations List - Collapsible */}
      {isExpanded && (
        <div className="border-t border-[var(--color-border)]">
          <ConversationList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
            onResumeSession={onResumeSession}
            onRenameSession={onRenameSession}
            emptyMessage=""
          />
        </div>
      )}
    </div>
  );
}

export default AgentGroup;
