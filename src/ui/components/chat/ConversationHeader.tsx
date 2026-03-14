import type { AgentDisplayStatus } from "../../store/useAppStore";

interface ConversationHeaderProps {
  title: string;
  agentName: string;
  status: AgentDisplayStatus;
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

export function ConversationHeader({ title, agentName, status }: ConversationHeaderProps) {
  const statusMeta = STATUS_LABELS[status] ?? STATUS_LABELS.idle;

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-4 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)]">
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
    </header>
  );
}
