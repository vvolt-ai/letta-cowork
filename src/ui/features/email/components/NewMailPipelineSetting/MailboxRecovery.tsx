import { SettingsSection } from "./SettingsSection";
import type { ProcessedUnreadEmailDebugInfo } from "../../types";

const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface MailboxRecoveryProps {
  accountId: string;
  folderId: string;
  debugInfo: ProcessedUnreadEmailDebugInfo | null;
  debugError: string | null;
  actionStatus: string | null;
  activeAction: "refresh" | "clear" | "reprocess" | null;
  canInspectMailbox: boolean;
  onRefresh: () => void;
  onClearProcessedIds: () => void;
  onReprocessUnreadNow: () => void;
}

export function MailboxRecovery({
  accountId,
  folderId,
  debugInfo,
  debugError,
  actionStatus,
  activeAction,
  canInspectMailbox,
  onRefresh,
  onClearProcessedIds,
  onReprocessUnreadNow,
}: MailboxRecoveryProps) {
  return (
    <SettingsSection
      eyebrow="Recovery tools"
      title="Mailbox state and reprocessing"
      description="These tools are for inspection and recovery. Use them when you need to understand what has already been processed or force the current mailbox to be reconsidered."
    >
      <div className="rounded-xl border border-ink-900/10 bg-surface-secondary/50 p-3 text-[11px] text-ink-700">
        <div>
          <span className="font-semibold">Account:</span> {accountId || "Not connected"}
        </div>
        <div className="mt-1">
          <span className="font-semibold">Folder:</span> {folderId || "Not selected"}
        </div>
        {debugInfo ? (
          <div className="mt-1 break-all text-muted">Mailbox key: {debugInfo.mailboxKey}</div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
          <div className="text-muted">Stored processed IDs</div>
          <div className="mt-1 text-lg font-semibold text-ink-800">{debugInfo?.count ?? 0}</div>
        </div>
        <div className="rounded-xl border border-ink-900/10 bg-white px-3 py-3">
          <div className="text-muted">Retention window</div>
          <div className="mt-1 text-sm font-semibold text-ink-800">
            {debugInfo ? `${debugInfo.retentionDays} days` : "—"}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-ink-900/10 bg-white px-3 py-3 text-[11px] text-ink-700">
        <div>
          <span className="font-semibold">Newest processed:</span> {formatTimestamp(debugInfo?.newestProcessedAt)}
        </div>
        <div className="mt-1">
          <span className="font-semibold">Oldest retained:</span> {formatTimestamp(debugInfo?.oldestProcessedAt)}
        </div>
        <div className="mt-1">
          <span className="font-semibold">Retention cap:</span> {debugInfo?.maxEntries ?? "—"}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button
          className="rounded-lg border border-ink-900/10 bg-white px-3 py-2 font-medium text-ink-700 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void onRefresh()}
          disabled={!canInspectMailbox || activeAction !== null}
        >
          {activeAction === "refresh" ? "Refreshing…" : "Refresh state"}
        </button>
        <button
          className="rounded-lg border border-ink-900/10 bg-white px-3 py-2 font-medium text-ink-700 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void onClearProcessedIds()}
          disabled={!canInspectMailbox || activeAction !== null}
        >
          {activeAction === "clear" ? "Clearing…" : "Clear processed IDs"}
        </button>
        <button
          className="rounded-lg bg-[var(--color-accent)] px-3 py-2 font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void onReprocessUnreadNow()}
          disabled={!canInspectMailbox || activeAction !== null}
        >
          {activeAction === "reprocess" ? "Reprocessing…" : "Reprocess unread now"}
        </button>
      </div>

      {actionStatus ? (
        <div className="mt-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-3 py-2 text-xs text-[var(--color-accent-hover)]">
          {actionStatus}
        </div>
      ) : null}

      {debugError ? (
        <div className="mt-3 rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-xs text-error">
          {debugError}
        </div>
      ) : null}
    </SettingsSection>
  );
}
