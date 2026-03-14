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

export function ConversationHeader({ title, agentName, status, activityOpen = true, onToggleActivity }: ConversationHeaderProps) {
  const statusMeta = STATUS_LABELS[status] ?? STATUS_LABELS.idle;
  const toggleLabel = activityOpen ? "Hide activity" : "Show activity";
  const toggleAria = activityOpen ? "Hide activity panel" : "Show activity panel";

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <span>Agent: {agentName}</span>
            <span className={`inline-flex items-center gap-1 font-medium ${statusMeta.color}`}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {statusMeta.label}
            </span>
          </div>
        </div>

        {onToggleActivity ? (
          <button
            type="button"
            onClick={onToggleActivity}
            aria-label={toggleAria}
            className="hidden items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-xs font-medium text-ink-700 transition hover:bg-[var(--color-surface-tertiary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] lg:inline-flex"
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
            <span>{toggleLabel}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
