import { SettingsSection } from "./SettingsSection";
import type { ProcessedEmailEntry } from "../../types";

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

interface RecentActivityProps {
  debugLoading: boolean;
  canInspectMailbox: boolean;
  recentEntries: ProcessedEmailEntry[];
}

export function RecentActivity({ debugLoading, canInspectMailbox, recentEntries }: RecentActivityProps) {
  return (
    <SettingsSection
      eyebrow="Recent activity"
      title="Recently retained message IDs"
      description="This sample shows the most recent processed unread messages remembered for this mailbox."
    >
      <div className="max-h-72 overflow-y-auto rounded-xl border border-ink-900/10 bg-white">
        {debugLoading ? (
          <div className="px-3 py-3 text-xs text-muted">Loading mailbox state…</div>
        ) : !canInspectMailbox ? (
          <div className="px-3 py-3 text-xs text-muted">
            Connect an inbox and select a folder to inspect processed unread state.
          </div>
        ) : recentEntries.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted">
            No processed unread IDs are currently stored for this mailbox.
          </div>
        ) : (
          <div className="divide-y divide-ink-900/10">
            {recentEntries.map((entry) => (
              <div key={`${entry.id}-${entry.processedAt}`} className="px-3 py-2 text-[11px]">
                <div className="break-all font-medium text-ink-800">{entry.id}</div>
                <div className="mt-0.5 text-muted">Processed {formatTimestamp(entry.processedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
