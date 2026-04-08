import { WhatsAppConfig, TelegramConfig, DiscordConfig } from './types';

// WhatsApp-specific config fields
export function WhatsAppConfigFields({
  configData,
  setConfigData,
}: {
  configData: WhatsAppConfig;
  setConfigData: (v: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configSelfChatMode"
          checked={configData.selfChatMode || false}
          onChange={(e) =>
            setConfigData({ ...configData, selfChatMode: e.target.checked })
          }
          className="rounded border-slate-300"
        />
        <label htmlFor="configSelfChatMode" className="text-sm text-slate-700">
          Self chat mode (respond to own messages)
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configRespondToGroups"
          checked={configData.respondToGroups || false}
          onChange={(e) =>
            setConfigData({ ...configData, respondToGroups: e.target.checked })
          }
          className="rounded border-slate-300"
        />
        <label htmlFor="configRespondToGroups" className="text-sm text-slate-700">
          Respond to group messages
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configRespondOnlyWhenMentioned"
          checked={configData.respondOnlyWhenMentioned || false}
          onChange={(e) =>
            setConfigData({
              ...configData,
              respondOnlyWhenMentioned: e.target.checked,
            })
          }
          className="rounded border-slate-300"
        />
        <label
          htmlFor="configRespondOnlyWhenMentioned"
          className="text-sm text-slate-700"
        >
          Respond only when mentioned (groups)
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Session Path
        </label>
        <input
          type="text"
          value={configData.sessionPath || ''}
          onChange={(e) =>
            setConfigData({ ...configData, sessionPath: e.target.value })
          }
          placeholder="./data/whatsapp-session"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg"
        />
        <p className="text-xs text-slate-500 mt-1">
          Path to store WhatsApp session data
        </p>
      </div>
    </>
  );
}

// Telegram-specific config fields
export function TelegramConfigFields({
  configData,
  setConfigData,
}: {
  configData: TelegramConfig;
  setConfigData: (v: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configRespondToGroups"
          checked={configData.respondToGroups || false}
          onChange={(e) =>
            setConfigData({ ...configData, respondToGroups: e.target.checked })
          }
          className="rounded border-slate-300"
        />
        <label htmlFor="configRespondToGroups" className="text-sm text-slate-700">
          Respond to group messages
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configRespondOnlyWhenMentioned"
          checked={configData.respondOnlyWhenMentioned || false}
          onChange={(e) =>
            setConfigData({
              ...configData,
              respondOnlyWhenMentioned: e.target.checked,
            })
          }
          className="rounded border-slate-300"
        />
        <label
          htmlFor="configRespondOnlyWhenMentioned"
          className="text-sm text-slate-700"
        >
          Respond only when mentioned (groups)
        </label>
      </div>
    </>
  );
}

// Discord-specific config fields
export function DiscordConfigFields({
  configData,
  setConfigData,
}: {
  configData: DiscordConfig;
  setConfigData: (v: Record<string, unknown>) => void;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          DM Policy
        </label>
        <select
          value={configData.dmPolicy || 'pairing'}
          onChange={(e) =>
            setConfigData({ ...configData, dmPolicy: e.target.value as 'pairing' | 'allowlist' | 'open' })
          }
          className="w-full px-3 py-2 border border-slate-200 rounded-lg"
        >
          <option value="pairing">Pairing (require explicit pairing)</option>
          <option value="allowlist">Allowlist (only allowed users)</option>
          <option value="open">Open (respond to all DMs)</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configRespondToGroups"
          checked={configData.respondToGroups || false}
          onChange={(e) =>
            setConfigData({ ...configData, respondToGroups: e.target.checked })
          }
          className="rounded border-slate-300"
        />
        <label htmlFor="configRespondToGroups" className="text-sm text-slate-700">
          Respond to group messages
        </label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="configRespondOnlyWhenMentioned"
          checked={configData.respondOnlyWhenMentioned || false}
          onChange={(e) =>
            setConfigData({
              ...configData,
              respondOnlyWhenMentioned: e.target.checked,
            })
          }
          className="rounded border-slate-300"
        />
        <label
          htmlFor="configRespondOnlyWhenMentioned"
          className="text-sm text-slate-700"
        >
          Respond only when mentioned (groups)
        </label>
      </div>
    </>
  );
}
