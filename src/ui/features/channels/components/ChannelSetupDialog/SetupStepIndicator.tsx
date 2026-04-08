import { ChannelType, CHANNEL_LABELS, CHANNEL_STEPS } from "../ChannelSettings";

interface SetupStepIndicatorProps {
  activeChannel: ChannelType;
  onOpenDocs: () => void;
}

export function SetupStepIndicator({ activeChannel, onOpenDocs }: SetupStepIndicatorProps) {
  const steps = CHANNEL_STEPS[activeChannel];
  const channelLabel = CHANNEL_LABELS[activeChannel];

  return (
    <div className="rounded-xl border border-ink-900/10 bg-surface p-3">
      <div className="text-sm font-semibold text-ink-800">Setup Checklist</div>
      <div className="mt-2 flex flex-col gap-2">
        {steps.map((step, index) => (
          <div key={step} className="rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-700">
            <span className="font-semibold text-ink-900">{index + 1}. </span>
            {step}
          </div>
        ))}
      </div>
      <button
        className="mt-3 w-full rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
        onClick={onOpenDocs}
      >
        Open {channelLabel} Docs
      </button>
    </div>
  );
}
