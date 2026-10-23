interface IntegrationListProps {
  isEmailConnected: boolean;
  unreadLabel: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenInbox: () => void;
  onRefresh?: () => void;
}

export function IntegrationList({
  isEmailConnected,
  unreadLabel,
  onConnect,
  onDisconnect,
  onOpenInbox,
  onRefresh,
}: IntegrationListProps) {
  return (
    <div className="space-y-3 text-sm text-ink-700">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Email automation</div>
            <div className="mt-1 text-sm font-semibold text-ink-800">Inbox connection</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span>{unreadLabel}</span>
              {onRefresh && isEmailConnected ? (
                <button
                  onClick={onRefresh}
                  className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
                >
                  Refresh
                </button>
              ) : null}
            </div>
          </div>
          <span
            className={`mt-1 h-2.5 w-2.5 rounded-full ${
              isEmailConnected ? "bg-[var(--color-status-completed)]" : "bg-ink-300"
            }`}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
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
      </div>

    </div>
  );
}
