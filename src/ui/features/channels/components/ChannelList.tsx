
import { ChannelCard } from './ChannelCard';
import { type Channel, type ChannelStatus as ChannelStatusType } from './types';

interface ChannelListProps {
  channels: Channel[];
  statuses: Record<string, ChannelStatusType>;
  onStart: (channelId: string) => void;
  onStop: (channelId: string) => void;
  onOpenCredentials: (channel: Channel) => void;
  onOpenConfig: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
}

export function ChannelList({
  channels,
  statuses,
  onStart,
  onStop,
  onOpenCredentials,
  onOpenConfig,
  onDelete,
}: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-secondary)] py-10 text-center text-muted">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">＋</div>
        <p className="mt-3 text-sm font-medium text-ink-800">No channels configured</p>
        <p className="mt-1 text-xs">Use “Add channel” to connect your first provider.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {channels.map((channel) => {
        const status = statuses[channel.id];
        return (
          <ChannelCard
            key={channel.id}
            channel={channel}
            status={status}
            onStart={onStart}
            onStop={onStop}
            onOpenCredentials={onOpenCredentials}
            onOpenConfig={onOpenConfig}
            onDelete={onDelete}
          />
        );
      })}
    </div>
  );
}
