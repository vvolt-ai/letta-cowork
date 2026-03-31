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

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
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

      {isEmailConnected ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Automation behavior</div>
              <div className="mt-1 text-sm font-semibold text-ink-800">Auto-sync unread email</div>
              <p className="mt-1 text-xs leading-5 text-muted">
                When enabled, unread email is routed using your fallback agents and any sender-based rules.
              </p>
            </div>
            <button
              onClick={() => onToggleAutoSync(!autoSyncEnabled)}
              className={`mt-1 inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 ${
                autoSyncEnabled
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                  : "border-[var(--color-bg-400)] bg-[var(--color-bg-300)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] hover:border-[var(--color-border-hover)]"
              }`}
              aria-pressed={autoSyncEnabled}
              aria-label="Toggle auto-sync"
            >
              <span
                className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.2),0_1px_2px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out ${
                  autoSyncEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {onManageRules ? (
            <button
              onClick={onManageRules}
              className="mt-3 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-left text-xs font-medium text-[var(--color-accent)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent-hover)]"
            >
              Configure automation
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
