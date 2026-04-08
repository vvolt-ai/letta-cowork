
import { Channel, ChannelStatus as ChannelStatusType } from './types';
import { ChannelCard } from './ChannelCard';

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
      <div className="text-center py-8 text-slate-500">
        <p>No channels configured</p>
        <p className="text-sm mt-1">Click "Add Channel" to get started</p>
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
