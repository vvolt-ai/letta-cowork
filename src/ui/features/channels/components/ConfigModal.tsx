import { Channel, LettaAgent, WhatsAppConfig, TelegramConfig, DiscordConfig } from './types';
import { getProviderIcon } from './ChannelCard';
import { WhatsAppConfigFields, TelegramConfigFields, DiscordConfigFields } from './ProviderConfigFields';

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

          {/* Auto Start - All providers */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="configAutoStart"
              checked={Boolean(configData.autoStart)}
              onChange={(e) =>
                setConfigData({ ...configData, autoStart: e.target.checked })
              }
              className="rounded border-slate-300"
            />
            <label htmlFor="configAutoStart" className="text-sm text-slate-700">
              Auto-start when server starts
            </label>
          </div>

          {/* Typing Indicator - All providers */}
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

          {/* Allowed Users - All providers */}
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

          {/* WhatsApp specific options */}
          {channel.provider === 'whatsapp' && (
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
