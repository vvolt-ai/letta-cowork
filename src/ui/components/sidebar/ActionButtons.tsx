import { ChangeEnv } from "../ChangeEnv";

interface ActionButtonsProps {
  lettaEnvOpen: boolean;
  onLettaEnvOpenChange: (open: boolean) => void;
  onNewSession: () => void;
  onOpenSkillDownload: () => void;
}

export function ActionButtons({
  lettaEnvOpen,
  onLettaEnvOpenChange,
  onNewSession,
  onOpenSkillDownload,
}: ActionButtonsProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ChangeEnv
        className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
        open={lettaEnvOpen}
        onOpenChange={onLettaEnvOpenChange}
      />
      <button
        className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
        onClick={onNewSession}
      >
        New Task
      </button>
      <button
        className="rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary hover:border-ink-900/20 transition-colors"
        onClick={onOpenSkillDownload}
      >
        Download Skill
      </button>
    </div>
  );
}
