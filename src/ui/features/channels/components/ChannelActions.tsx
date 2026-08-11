
import { type Channel, type ChannelStatus, type WhatsAppConfig } from './types';

interface ChannelActionsProps {
  channel: Channel;
  status?: ChannelStatus;
  onStart: (channelId: string) => void;
  onStop: (channelId: string) => void;
  onOpenCredentials: (channel: Channel) => void;
  onOpenConfig: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
}

function isWhatsAppRouteChannel(channel: Channel): boolean {
  return channel.provider === 'whatsapp' && (channel.config as WhatsAppConfig | undefined)?.whatsappMode === 'agent_route';
}

export function ChannelActions({
  channel,
  status,
  onStart,
  onStop,
  onOpenCredentials,
  onOpenConfig,
  onDelete,
}: ChannelActionsProps) {
  const isRouteChannel = isWhatsAppRouteChannel(channel);
  const isEmailChannel = channel.provider === 'email';

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {isRouteChannel ? null : !channel.hasCredentials && channel.provider !== 'whatsapp' && !isEmailChannel ? (
        <button
          onClick={() => onOpenCredentials(channel)}
          className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          Set Credentials
        </button>
      ) : (
        <>
          {status?.connected ? (
            <button
              onClick={() => onStop(channel.id)}
              className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => onStart(channel.id)}
              className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
            >
              Start
            </button>
          )}
          {!isEmailChannel ? (
            <button
              onClick={() => onOpenCredentials(channel)}
              className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
            >
              {channel.provider === 'whatsapp' ? 'Session' : 'Edit Credentials'}
            </button>
          ) : null}
        </>
      )}
      {!isEmailChannel ? (
        <>
          <button
            onClick={() => onOpenConfig(channel)}
            className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
          >
            Config
          </button>
          <button
            onClick={() => onDelete(channel.id)}
            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            Delete
          </button>
        </>
      ) : null}
    </div>
  );
}
