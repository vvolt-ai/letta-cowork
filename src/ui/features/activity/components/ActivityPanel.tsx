import type { PermissionRequest, EphemeralState, AgentDisplayStatus, CoworkSettings } from "../../../store/useAppStore";
import type { CanUseToolResponse } from "../../../types";

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
              <div className="flex items-center gap-2">
                <div className="font-medium text-ink-800">{request.toolName}</div>
                {request.source === "recovered" ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                    Recovered
                  </span>
                ) : null}
              </div>
              {request.runId ? (
                <div className="mt-1 text-[11px] text-ink-500">Run: {request.runId}</div>
              ) : null}
              <div className="mt-1 break-words text-ink-500">{String(request.input)}</div>
              {request.source === "recovered" ? (
                <div className="mt-2 text-[11px] text-orange-700">
                  This approval was recovered after a reconnect. If approval cannot be completed, cancel the stuck run from the conversation controls.
                </div>
              ) : null}
              {onPermissionResult ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => onPermissionResult(request.toolUseId, { behavior: "allow" })}
                    className="flex-1 rounded-md bg-[var(--color-status-completed)] px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-[var(--color-status-completed)]/90"
                    disabled={request.source === "recovered"}
                    title={request.source === "recovered" ? "Recovered approvals are currently informational only" : undefined}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onPermissionResult(request.toolUseId, { behavior: "deny", message: "Denied by user" })}
                    className="flex-1 rounded-md border border-[var(--color-status-error)]/40 bg-[var(--color-status-error)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--color-status-error)] hover:bg-[var(--color-status-error)]/20"
                    disabled={request.source === "recovered"}
                    title={request.source === "recovered" ? "Recovered approvals are currently informational only" : undefined}
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
