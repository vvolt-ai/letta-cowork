import { ChannelType, CHANNEL_LABELS } from "../ChannelSettings";

interface ProviderSelectionProps {
  availableChannels: ChannelType[];
  activeChannel: ChannelType;
  onChannelSelect: (channel: ChannelType) => void;
}

export function ProviderSelection({ availableChannels, activeChannel, onChannelSelect }: ProviderSelectionProps) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {availableChannels.map((channel) => (
        <button
          key={channel}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
            activeChannel === channel
              ? "border-accent/40 bg-accent-subtle text-ink-900"
              : "border-ink-900/10 bg-surface text-ink-700 hover:bg-surface-tertiary"
          }`}
          onClick={() => onChannelSelect(channel)}
        >
          {CHANNEL_LABELS[channel]}
        </button>
      ))}
    </div>
  );
}
