interface IntegrationListProps {
  isEmailConnected: boolean;
  unreadLabel: string;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenInbox: () => void;
  onRefresh?: () => void;
  onManageRules?: () => void;
}

export function IntegrationList({
  isEmailConnected,
  unreadLabel,
  autoSyncEnabled,
  onToggleAutoSync,
  onConnect,
  onDisconnect,
  onOpenInbox,
  onRefresh,
  onManageRules,
}: IntegrationListProps) {
  return (
    <div className="space-y-2 text-sm text-ink-700">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-ink-800">Email Automation</div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{unreadLabel}</span>
            {onRefresh && isEmailConnected && (
              <button
                onClick={onRefresh}
                className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            isEmailConnected ? "bg-[var(--color-status-completed)]" : "bg-ink-300"
          }`}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {isEmailConnected ? (
          <>
            <button
              onClick={onOpenInbox}
              className="rounded-md px-2 py-1 text-ink-600 transition hover:bg-[var(--color-sidebar-hover)] hover:text-ink-900"
            >
              Open inbox
            </button>
            <button
              onClick={onDisconnect}
              className="rounded-md px-2 py-1 text-error transition hover:bg-error/10"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[var(--color-accent-hover)]"
          >
            Connect inbox
          </button>
        )}
      </div>

      {isEmailConnected && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
          <span className="text-ink-600">Auto-sync unread</span>
          <button
            onClick={() => onToggleAutoSync(!autoSyncEnabled)}
            className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
              autoSyncEnabled ? "bg-[var(--color-accent)]" : "bg-ink-300"
            }`}
            aria-pressed={autoSyncEnabled}
            aria-label="Toggle auto-sync"
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                autoSyncEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {onManageRules && (
        <button
          onClick={onManageRules}
          className="text-xs font-medium text-[var(--color-accent)] transition hover:text-[var(--color-accent-hover)]"
        >
          Routing rules
        </button>
      )}
    </div>
  );
}
