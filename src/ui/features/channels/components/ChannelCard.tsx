
import { Channel, ChannelStatus as ChannelStatusType, PROVIDERS } from './types';
import { ChannelStatus } from './ChannelStatus';
import { ChannelActions } from './ChannelActions';

interface ChannelCardProps {
  channel: Channel;
  status?: ChannelStatusType;
  onStart: (channelId: string) => void;
  onStop: (channelId: string) => void;
  onOpenCredentials: (channel: Channel) => void;
  onOpenConfig: (channel: Channel) => void;
  onDelete: (channelId: string) => void;
}

export function getProviderIcon(provider: string): string {
  const found = PROVIDERS.find(p => p.id === provider);
  return found?.icon || '📡';
}

export function ChannelCard({
  channel,
  status,
  onStart,
  onStop,
  onOpenCredentials,
  onOpenConfig,
  onDelete,
}: ChannelCardProps) {
  return (
    <div className="p-4 bg-white rounded-lg border border-slate-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getProviderIcon(channel.provider)}</span>
          <div>
            <h3 className="font-medium text-slate-900">{channel.name}</h3>
            <p className="text-sm text-slate-500 capitalize">{channel.provider}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChannelStatus status={status} />
        </div>
      </div>

      {/* Show config info */}
      {channel.config && Object.keys(channel.config).length > 0 && (
        <div className="mt-2 text-xs text-slate-500">
          {channel.config.defaultAgentId && (
            <span>Agent: {String(channel.config.defaultAgentId)}</span>
          )}
          {Boolean(channel.config.autoStart) && (
            <span className="ml-2">• Auto-start</span>
          )}
        </div>
      )}

      {/* QR Code for WhatsApp */}
      {status?.status === 'qr' && status.qrDataUrl && (
        <div className="mt-4 p-4 bg-slate-50 rounded-lg text-center">
          <p className="text-sm text-slate-600 mb-2">
            Scan this QR code with WhatsApp
          </p>
          <img
            src={status.qrDataUrl}
            alt="WhatsApp QR"
            className="mx-auto w-40 h-40"
          />
        </div>
      )}

      {/* Error message */}
      {status?.error && (
        <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
          {status.error}
        </div>
      )}

      {/* Actions */}
      <ChannelActions
        channel={channel}
        status={status}
        onStart={onStart}
        onStop={onStop}
        onOpenCredentials={onOpenCredentials}
        onOpenConfig={onOpenConfig}
        onDelete={onDelete}
      />
    </div>
  );
}
