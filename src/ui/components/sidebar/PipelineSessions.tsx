import type { SessionView } from "../../store/useAppStore";

interface PipelineSessionsProps {
  sessions: SessionView[];
  activeSessionId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  formatCwd: (cwd?: string) => string;
}

export function PipelineSessions({
  sessions,
  activeSessionId,
  expanded,
  onToggle,
  onSelectSession,
  onDeleteSession,
  formatCwd,
}: PipelineSessionsProps) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 rounded-xl border border-ink-900/10 bg-surface p-2">
      <button
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-ink-700 hover:bg-surface-tertiary"
        onClick={onToggle}
      >
        <span>Unread Pipeline Runs</span>
        <span className="text-[10px] text-muted">
          {sessions.length} {expanded ? "hide" : "show"}
        </span>
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`cursor-pointer rounded-xl border px-2 py-3 text-left transition ${
                activeSessionId === session.id
                  ? "border-accent/30 bg-accent-subtle"
                  : "border-ink-900/5 bg-surface hover:bg-surface-tertiary"
              }`}
              onClick={() => onSelectSession(session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectSession(session.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div
                    className={`truncate text-[12px] font-medium ${
                      session.status === "running"
                        ? "text-info"
                        : session.status === "completed"
                        ? "text-success"
                        : session.status === "error"
                        ? "text-error"
                        : "text-ink-800"
                    }`}
                  >
                    {session.title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">{formatCwd(session.cwd)}</div>
                </div>
                <button
                  className="rounded-full p-1.5 text-ink-500 hover:bg-ink-900/10"
                  aria-label="Delete pipeline session"
                  title="Delete pipeline session"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M4 7h16" />
                    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
