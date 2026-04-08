import { SettingsSection } from "./SettingsSection";

interface SyncSettingsProps {
  autoSyncMarkAsRead: boolean;
  onSetAutoSyncMarkAsRead: (enabled: boolean) => void;
  autoSyncSinceDate: string;
  onSetAutoSyncSinceDate: (date: string) => void;
}

export function SyncSettings({
  autoSyncMarkAsRead,
  onSetAutoSyncMarkAsRead,
  autoSyncSinceDate,
  onSetAutoSyncSinceDate,
}: SyncSettingsProps) {
  return (
    <>
      <SettingsSection
        eyebrow="Step 4"
        title="Mark emails as read after processing"
        description="When enabled, processed emails will be marked as read in your inbox. Disable this if you want to keep emails unread for manual review."
      >
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted">
            {autoSyncMarkAsRead
              ? "Emails will be marked as read after successful processing"
              : "Emails will remain unread after processing"}
          </div>
          <button
            onClick={() => onSetAutoSyncMarkAsRead(!autoSyncMarkAsRead)}
            className={`inline-flex h-6 w-11 items-center rounded-full border p-0.5 transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 ${
              autoSyncMarkAsRead
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                : "border-[var(--color-bg-400)] bg-[var(--color-bg-300)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] hover:border-[var(--color-border-hover)]"
            }`}
            aria-pressed={autoSyncMarkAsRead}
            aria-label="Toggle mark as read"
          >
            <span
              className={`h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.2),0_1px_2px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-out ${
                autoSyncMarkAsRead ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="Step 5"
        title="Set a sync boundary"
        description="Use a start date when you want automation to ignore older email. Leaving this blank allows all eligible messages in the selected mode to be considered."
      >
        <div className="rounded-xl border border-ink-900/10 bg-surface-secondary/50 p-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="flex-1 rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-800 focus:outline-none focus:ring-1 focus:ring-accent/30"
              value={autoSyncSinceDate}
              onChange={(e) => onSetAutoSyncSinceDate(e.target.value)}
            />
            {autoSyncSinceDate ? (
              <button
                className="rounded-lg border border-ink-900/10 bg-surface px-2.5 py-2 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary"
                onClick={() => onSetAutoSyncSinceDate("")}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="mt-2 text-[11px] text-muted">
            Current boundary: {autoSyncSinceDate || "No date limit — all unread email is eligible."}
          </div>
        </div>
      </SettingsSection>
    </>
  );
}
