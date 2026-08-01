import { memo } from "react";
import type { AgentDisplayStatus } from "../../../store/useAppStore";

interface ConversationHeaderProps {
  title: string;
  agentName: string;
  agentId?: string;
  sessionId?: string;
  status: AgentDisplayStatus;
  activityOpen?: boolean;
  projectOpen?: boolean;
  onToggleActivity?: () => void;
  onToggleProject?: () => void;
  onViewRuns?: () => void;
}

const STATUS_LABELS: Record<AgentDisplayStatus, { label: string; color: string }> = {
  idle: { label: "Idle", color: "text-muted" },
  thinking: { label: "Thinking", color: "text-[var(--color-status-thinking)]" },
  running_tool: { label: "Running tool", color: "text-[var(--color-status-running)]" },
  waiting_approval: { label: "Waiting approval", color: "text-[var(--color-warning)]" },
  generating: { label: "Responding", color: "text-[var(--color-accent)]" },
  completed: { label: "Completed", color: "text-[var(--color-status-completed)]" },
  error: { label: "Error", color: "text-[var(--color-status-error)]" },
};

export const ConversationHeader = memo(function ConversationHeader({ title, agentName, agentId, sessionId, status, activityOpen = true, projectOpen = false, onToggleActivity, onToggleProject, onViewRuns }: ConversationHeaderProps) {
  const statusMeta = STATUS_LABELS[status] ?? STATUS_LABELS.idle;
  const toggleLabel = activityOpen ? "Hide activity" : "Show activity";
  const toggleAria = activityOpen ? "Hide activity panel" : "Show activity panel";
  const isRawConversationId = title.startsWith("conv-");
  const displayTitle = !title || isRawConversationId ? "New conversation" : title;

  const handleOpenInLetta = () => {
    if (agentId && sessionId) {
      const lettaUrl = `https://app.letta.com/projects/default-project/agents/${agentId}?conversation=${sessionId}`;
      window.electron.openExternal(lettaUrl);
    }
  };

  return (
    <header className="h-12 border-b border-[var(--color-border)] bg-[var(--color-bg-000)]/90 px-4 backdrop-blur-md lg:px-8">
      <div className="mx-auto grid h-full w-full max-w-[1200px] grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          <span>Vera Cowork</span>
          <span className="hidden h-1 w-1 rounded-full bg-[var(--color-border-hover)] sm:block" />
          <span className="hidden truncate sm:block">{agentName}</span>
        </div>

          <div className="flex min-w-0 items-center justify-center gap-2">
            <h2 className="max-w-[40vw] truncate text-[15px] font-medium tracking-tight text-ink-900">
              {displayTitle}
            </h2>
            <span className={`inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium ${statusMeta.color}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {statusMeta.label}
            </span>
          </div>

        <div className="flex items-center justify-self-end gap-1.5">
          {onToggleProject ? (
            <button
              type="button"
              onClick={onToggleProject}
              aria-pressed={projectOpen}
              className={`hidden h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition lg:inline-flex ${projectOpen ? "border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-surface)] text-ink-600 hover:bg-[var(--color-surface-hover)] hover:text-ink-900"}`}
              title={projectOpen ? "Hide project files" : "Show project files"}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6.5h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M3 8.5v-3a2 2 0 0 1 2-2h4l2 2h4" />
              </svg>
              Files
            </button>
          ) : null}

          {/* View Runs Button — opens Runs Debugger scoped to this conversation */}
          {onViewRuns && sessionId && (
            <button
              onClick={onViewRuns}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-ink-600 transition hover:bg-[var(--color-surface-hover)] hover:text-ink-900"
              title="View runs for this conversation"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Runs
            </button>
          )}

          {/* Open in Letta Button */}
          {agentId && sessionId && (
            <button
              onClick={handleOpenInLetta}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-ink-600 transition hover:bg-[var(--color-surface-hover)] hover:text-ink-900"
              title="Open in Letta"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Letta
            </button>
          )}

          {onToggleActivity ? (
            <button
              type="button"
              onClick={onToggleActivity}
              aria-label={toggleAria}
              title={toggleLabel}
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-700 transition hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] lg:inline-flex"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-ink-500"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {activityOpen ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
});
