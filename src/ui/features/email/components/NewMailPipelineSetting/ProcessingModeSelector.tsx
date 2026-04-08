import { SettingsSection } from "./SettingsSection";
import type { AutoSyncProcessingMode } from "../../types";

interface ProcessingModeSelectorProps {
  autoSyncProcessingMode: AutoSyncProcessingMode;
  onSetAutoSyncProcessingMode: (mode: AutoSyncProcessingMode) => void;
}

export function ProcessingModeSelector({
  autoSyncProcessingMode,
  onSetAutoSyncProcessingMode,
}: ProcessingModeSelectorProps) {
  return (
    <SettingsSection
      eyebrow="Step 3"
      title="Choose what gets processed"
      description="Pick whether automation should only handle unread email or process every email received today, even if it is already read."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSetAutoSyncProcessingMode("unread_only")}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            autoSyncProcessingMode === "unread_only"
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-ink-900/10 bg-surface-secondary/50 hover:border-[var(--color-accent)]/40"
          }`}
        >
          <div className="text-xs font-semibold text-ink-800">Process unread emails only</div>
          <div className="mt-1 text-[11px] leading-5 text-muted">
            Uses unread state as the gate and only routes unread messages.
          </div>
        </button>
        <button
          type="button"
          onClick={() => onSetAutoSyncProcessingMode("today_all")}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            autoSyncProcessingMode === "today_all"
              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
              : "border-ink-900/10 bg-surface-secondary/50 hover:border-[var(--color-accent)]/40"
          }`}
        >
          <div className="text-xs font-semibold text-ink-800">Process all emails from today</div>
          <div className="mt-1 text-[11px] leading-5 text-muted">
            Includes both read and unread emails received during the current local day.
          </div>
        </button>
      </div>
    </SettingsSection>
  );
}
