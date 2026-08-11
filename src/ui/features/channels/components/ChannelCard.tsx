
import { ChannelActions } from './ChannelActions';
import { ChannelStatus } from './ChannelStatus';
import { type Channel, type ChannelStatus as ChannelStatusType, PROVIDERS, type WhatsAppConfig } from './types';

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

function isWhatsAppRouteChannel(channel: Channel): boolean {
  return channel.provider === 'whatsapp' && (channel.config as WhatsAppConfig | undefined)?.whatsappMode === 'agent_route';
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
  const isRouteChannel = isWhatsAppRouteChannel(channel);
  const whatsappConfig = channel.config as WhatsAppConfig | undefined;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-soft)] transition hover:border-[var(--color-border-strong)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent-subtle)] text-xl">{getProviderIcon(channel.provider)}</span>
          <div>
            <h3 className="text-sm font-semibold text-ink-900">{channel.name}</h3>
            <p className="mt-0.5 text-xs capitalize text-muted">
              {isRouteChannel ? 'WhatsApp agent route' : channel.provider}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRouteChannel ? (
            <span className="rounded-full bg-[var(--color-accent-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--color-accent)]">
              Route
            </span>
          ) : (
            <ChannelStatus status={status} />
          )}
        </div>
      </div>

      {/* Show config info */}
      {channel.config && Object.keys(channel.config).length > 0 && (
        <div className="ml-[52px] mt-2 text-[11px] text-muted">
          {channel.config.defaultAgentId && (
            <span>Agent: {String(channel.config.defaultAgentId)}</span>
          )}
          {Boolean(channel.config.autoStart) && !isRouteChannel && (
            <span className="ml-2">• Auto-start</span>
          )}
          {isRouteChannel && whatsappConfig?.parentChannelId && (
            <span className="ml-2">• Uses account {String(whatsappConfig.parentChannelId).slice(0, 8)}...</span>
          )}
        </div>
      )}

      {/* QR Code for WhatsApp */}
      {status?.status === 'qr' && status.qrDataUrl && (
        <div className="mt-4 rounded-xl bg-[var(--color-surface-secondary)] p-4 text-center">
          <p className="mb-2 text-xs text-ink-600">
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
