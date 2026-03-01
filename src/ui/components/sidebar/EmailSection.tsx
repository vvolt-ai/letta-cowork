interface EmailSectionProps {
  isConnected: boolean;
  unreadCount: number;
  autoSyncEnabled: boolean;
  agentIds: string[];
  onConnect: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onOpenEmailView: () => void;
  onOpenAddAgents: () => void;
}

export function EmailSection({
  isConnected,
  unreadCount,
  autoSyncEnabled,
  agentIds,
  onConnect,
  onDisconnect,
  onRefresh,
  onToggleAutoSync,
  onOpenEmailView,
  onOpenAddAgents,
}: EmailSectionProps) {
  if (!isConnected) {
    return (
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={onConnect}
        >
          + Connect to Emails
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          className="flex flex-1 items-center justify-between rounded-xl border border-ink-900/10 bg-surface px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={onOpenEmailView}
        >
          <span className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 6h16v12H4z" />
              <path d="M4 7l8 6 8-6" />
            </svg>
            Emails
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          className="rounded-xl border border-ink-900/10 bg-surface p-2 text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
          onClick={onRefresh}
          aria-label="Refresh emails"
          title="Refresh emails"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M20 12a8 8 0 10-2.34 5.66" />
            <path d="M20 4v6h-6" />
          </svg>
        </button>
        <button
          className="rounded-xl border border-error/20 bg-error-light p-2 text-error hover:bg-error-light/80 transition-colors"
          onClick={onDisconnect}
          aria-label="Disconnect email"
          title="Disconnect email"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M21 3v18H9" />
          </svg>
        </button>
      </div>
      <div className="rounded-xl border border-ink-900/10 bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => onToggleAutoSync(e.target.checked)}
            />
            <span>Unread Pipeline</span>
          </label>
          <button
            className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
            onClick={onOpenAddAgents}
          >
            Add Agents ({agentIds.length})
          </button>
        </div>
      </div>
    </div>
  );
}
