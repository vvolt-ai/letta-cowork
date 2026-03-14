import type { PermissionRequest, EphemeralState, AgentDisplayStatus, CoworkSettings } from "../../store/useAppStore";
import type { CanUseToolResponse } from "../../types";

interface ActivityPanelProps {
  status: AgentDisplayStatus;
  ephemeral?: EphemeralState;
  permissionRequests: PermissionRequest[];
  coworkSettings: CoworkSettings;
  isEmailConnected: boolean;
  onPermissionResult?: (toolUseId: string, result: CanUseToolResponse) => void;
}

function PermissionsPanel({
  permissionRequests,
  onPermissionResult,
}: {
  permissionRequests: PermissionRequest[];
  onPermissionResult?: (toolUseId: string, result: CanUseToolResponse) => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.25em] text-muted">Permissions</h3>
      <div className="h-px bg-[var(--color-border)]" />
      {permissionRequests.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 text-xs text-muted">
          No pending approvals
        </div>
      ) : (
        <div className="space-y-2">
          {permissionRequests.map((request) => (
            <div
              key={request.toolUseId}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-ink-700"
            >
              <div className="font-medium text-ink-800">{request.toolName}</div>
              <div className="mt-1 truncate text-ink-500">{String(request.input)}</div>
              {onPermissionResult ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onPermissionResult(request.toolUseId, { behavior: "allow" })}
                    className="flex-1 rounded-md bg-[var(--color-status-completed)] px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-[var(--color-status-completed)]/90"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onPermissionResult(request.toolUseId, { behavior: "deny", message: "Denied by user" })}
                    className="flex-1 rounded-md border border-[var(--color-status-error)]/40 bg-[var(--color-status-error)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/20"
                  >
                    Deny
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActivityPanel({
  status: _status,
  ephemeral: _ephemeral,
  permissionRequests,
  coworkSettings: _coworkSettings,
  isEmailConnected: _isEmailConnected,
  onPermissionResult,
}: ActivityPanelProps) {
  return (
    <aside className="flex h-full w-full flex-col gap-6 overflow-y-auto px-5 py-6">
      <PermissionsPanel permissionRequests={permissionRequests} onPermissionResult={onPermissionResult} />
    </aside>
  );
}
