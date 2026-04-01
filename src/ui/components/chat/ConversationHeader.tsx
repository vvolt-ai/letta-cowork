import { memo } from "react";
import type { AgentDisplayStatus } from "../../store/useAppStore";

interface ConversationHeaderProps {
  title: string;
  agentName: string;
  status: AgentDisplayStatus;
  activityOpen?: boolean;
  onToggleActivity?: () => void;
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

export const ConversationHeader = memo(function ConversationHeader({ title, agentName, status, activityOpen = true, onToggleActivity }: ConversationHeaderProps) {
  const statusMeta = STATUS_LABELS[status] ?? STATUS_LABELS.idle;
  const toggleLabel = activityOpen ? "Hide activity" : "Show activity";
  const toggleAria = activityOpen ? "Hide activity panel" : "Show activity panel";
  const isRawConversationId = title.startsWith("conv-");
  const displayTitle = !title || isRawConversationId ? "New conversation" : title;

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.7rem)] backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            <span>Workspace</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border-hover)]" />
            <span>{agentName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold tracking-tight text-ink-900">
              {displayTitle}
            </h2>
            {isRawConversationId ? (
              <span className="font-mono text-[11px] text-muted">{title}</span>
            ) : (
              <span className="text-[11px] text-muted">Agent: {agentName}</span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusMeta.color} bg-[var(--color-surface-secondary)]`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {statusMeta.label}
            </span>
          </div>
        </div>

        {onToggleActivity ? (
          <button
            type="button"
            onClick={onToggleActivity}
            aria-label={toggleAria}
            title={toggleLabel}
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-700 shadow-sm transition hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] lg:inline-flex"
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
    </header>
  );
});
