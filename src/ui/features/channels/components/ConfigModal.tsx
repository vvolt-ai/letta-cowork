import { getProviderIcon } from './ChannelCard';
import { WhatsAppConfigFields, TelegramConfigFields, DiscordConfigFields } from './ProviderConfigFields';
import { type Channel, type LettaAgent, type WhatsAppConfig, type TelegramConfig, type DiscordConfig } from './types';

interface ConfigModalProps {
  channel: Channel;
  configData: Record<string, unknown>;
  setConfigData: (v: Record<string, unknown>) => void;
  agents: LettaAgent[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function ConfigModal({
  channel,
  configData,
  setConfigData,
  agents,
  saving,
  onClose,
  onSave,
}: ConfigModalProps) {
  const isWhatsAppRoute = channel.provider === 'whatsapp' && configData.whatsappMode === 'agent_route';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">
          {getProviderIcon(channel.provider)} {channel.name} Configuration
        </h3>

        <div className="space-y-4">
          {/* Default Agent - All providers */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Agent
            </label>
            <select
              value={(configData.defaultAgentId as string) || ''}
              onChange={(e) =>
                setConfigData({
                  ...configData,
                  defaultAgentId: e.target.value || undefined,
                })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              <option value="">No agent selected</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.id.slice(0, 8)}...)
                </option>
              ))}
            </select>
            {agents.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No agents found. Check your Letta configuration.
              </p>
            )}
          </div>

          {!isWhatsAppRoute && (
            <>
              {/* Auto Start - Runtime channels only */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="configAutoStart"
                  checked={configData.autoStart !== false}
                  onChange={(e) =>
                    setConfigData({ ...configData, autoStart: e.target.checked })
                  }
                  className="rounded border-slate-300"
                />
                <label htmlFor="configAutoStart" className="text-sm text-slate-700">
                  Auto-start when server starts
                </label>
              </div>

              {/* Typing Indicator - Runtime channels only */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="configTypingIndicator"
                  checked={configData.typingIndicator !== false}
                  onChange={(e) =>
                    setConfigData({ ...configData, typingIndicator: e.target.checked })
                  }
                  className="rounded border-slate-300"
                />
                <label
                  htmlFor="configTypingIndicator"
                  className="text-sm text-slate-700"
                >
                  Show typing indicator while processing
                </label>
              </div>
            </>
          )}

          {!isWhatsAppRoute && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Allowed Users
              </label>
              <input
                type="text"
                value={((configData.allowedUsers as string[]) || []).join(', ')}
                onChange={(e) =>
                  setConfigData({
                    ...configData,
                    allowedUsers: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={
                  channel.provider === 'whatsapp'
                    ? '1234567890, 0987654321'
                    : 'user_id_1, user_id_2'
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-lg"
              />
              <p className="text-xs text-slate-500 mt-1">
                {channel.provider === 'whatsapp'
                  ? 'Phone numbers with country code (no + sign)'
                  : 'Leave empty to allow all users'}
              </p>
            </div>
          )}

          {isWhatsAppRoute && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 space-y-2">
              <div className="font-medium">WhatsApp agent route</div>
              <div>Uses account: {String(configData.parentChannelId || '').slice(0, 8)}...</div>
              <div>Route type: {String(configData.routeType || 'fallback')}</div>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={configData.replyAllowed !== false}
                  onChange={(e) => setConfigData({ ...configData, replyAllowed: e.target.checked })}
                  className="rounded border-blue-300"
                />
                Allow this route to send replies
              </label>
              <p className="text-xs text-blue-700">
                The parent WhatsApp account still controls QR/session, start/stop,
                allowed users, group replies, and mention-only policy.
              </p>
            </div>
          )}

          {/* WhatsApp specific options */}
          {channel.provider === 'whatsapp' && !isWhatsAppRoute && (
            <WhatsAppConfigFields
              configData={configData as WhatsAppConfig}
              setConfigData={setConfigData}
            />
          )}

          {/* Telegram specific options */}
          {channel.provider === 'telegram' && (
            <TelegramConfigFields
              configData={configData as TelegramConfig}
              setConfigData={setConfigData}
            />
          )}

          {/* Discord specific options */}
          {channel.provider === 'discord' && (
            <DiscordConfigFields
              configData={configData as DiscordConfig}
              setConfigData={setConfigData}
            />
          )}
        </div>

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
