type ChannelType = "whatsapp" | "telegram" | "slack" | "discord";

interface ChannelButtonsProps {
  expanded: boolean;
  onToggle: () => void;
  onSelectChannel: (channel: ChannelType) => void;
}

export function ChannelButtons({ expanded, onToggle, onSelectChannel }: ChannelButtonsProps) {
  const channels: { id: ChannelType; label: string }[] = [
    { id: "whatsapp", label: "WhatsApp" },
    { id: "telegram", label: "Telegram" },
    { id: "slack", label: "Slack" },
    { id: "discord", label: "Discord" },
  ];

  return (
    <div className="rounded-xl border border-ink-900/10 bg-surface p-3">
      <button
        className="flex w-full items-center justify-between text-xs font-semibold text-ink-700 hover:text-ink-900"
        onClick={onToggle}
      >
        <span className="flex items-center gap-1">
          <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
          Letta Bot Channels
        </span>
      </button>
      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {channels.map((channel) => (
            <button
              key={channel.id}
              className="rounded-lg border border-ink-900/10 bg-white px-2 py-1.5 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary"
              onClick={() => onSelectChannel(channel.id)}
            >
              {channel.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
