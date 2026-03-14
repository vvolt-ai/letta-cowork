interface ChannelListProps {
  channels: Array<{
    id: string;
    label: string;
    enabled: boolean;
  }>;
  onConfigure?: () => void;
}

export function ChannelList({ channels, onConfigure }: ChannelListProps) {
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {channels.map((channel) => (
          <li key={channel.id} className="flex items-center justify-between text-sm text-ink-700">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  channel.enabled ? "bg-[var(--color-status-completed)]" : "bg-ink-300"
                }`}
              />
              <span className="truncate">{channel.label}</span>
            </div>
          </li>
        ))}
      </ul>
      {onConfigure && (
        <button
          onClick={onConfigure}
          className="text-xs font-medium text-[var(--color-accent)] transition hover:text-[var(--color-accent-hover)]"
        >
          Manage channels
        </button>
      )}
    </div>
  );
}
