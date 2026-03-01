import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { SessionView } from "../../store/useAppStore";

interface SessionListProps {
  sessions: SessionView[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeSession: (sessionId: string) => void;
  formatCwd: (cwd?: string) => string;
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onResumeSession,
  formatCwd,
}: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-ink-900/5 bg-surface px-4 py-5 text-center text-xs text-muted">
        No sessions yet. Click "+ New Task" to start.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div
                className={`text-[12px] font-medium ${
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
              <div className="mt-0.5 flex items-center justify-between text-xs text-muted">
                <span className="truncate">{formatCwd(session.cwd)}</span>
              </div>
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex-shrink-0 rounded-full p-1.5 text-ink-500 hover:bg-ink-900/10"
                  aria-label="Open session menu"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-50 min-w-[220px] rounded-xl border border-ink-900/10 bg-surface p-1 shadow-lg"
                  align="center"
                  sideOffset={8}
                >
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5"
                    onSelect={() => onDeleteSession(session.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-error/80"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M4 7h16" />
                      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      <path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
                    </svg>
                    Delete this session
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5"
                    onSelect={() => onResumeSession(session.id)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-ink-500"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M4 5h16v14H4z" />
                      <path d="M7 9h10M7 12h6" />
                      <path d="M13 15l3 2-3 2" />
                    </svg>
                    Resume in Letta Code
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      ))}
    </div>
  );
}
