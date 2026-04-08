import type { WhatsAppConfig, WhatsAppBridgeStatus } from "./whatsappConfig";
import { defaultWhatsAppConfig } from "./whatsappConfig";
import { AgentDropdown } from "../../../chat/components/AgentDropdown";

// Re-export for convenience
export { defaultWhatsAppConfig };

export type { WhatsAppConfig, WhatsAppBridgeStatus };

export const WHATSAPP_DEFAULT_CONFIG = defaultWhatsAppConfig();

interface WhatsAppSettingsProps {
  config: WhatsAppConfig;
  status: WhatsAppBridgeStatus | null;
  onConfigChange: (config: WhatsAppConfig) => void;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
  loading: boolean;
}

export function WhatsAppSettings({
  config,
  status,
  onConfigChange,
  onStart,
  onStop,
  isStarting,
  isStopping,
  loading,
}: WhatsAppSettingsProps) {
  return (
    <div className="mt-3 grid gap-2">
      <label className="text-xs text-ink-700">
        Default Agent ID
        <AgentDropdown
          value={config.defaultAgentId}
          onChange={(agentId) => onConfigChange({ ...config, defaultAgentId: agentId })}
        />
      </label>

      <label className="text-xs text-ink-700">
        Session Path
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.sessionPath}
          onChange={(e) => onConfigChange({ ...config, sessionPath: e.target.value })}
          placeholder="./data/whatsapp-session"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.selfChatMode}
          onChange={(e) => onConfigChange({ ...config, selfChatMode: e.target.checked })}
        />
        Self-chat mode (recommended for personal number)
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.autoStart}
          onChange={(e) => onConfigChange({ ...config, autoStart: e.target.checked })}
        />
        Auto-start bridge on app launch
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.respondToGroups}
          onChange={(e) => onConfigChange({ ...config, respondToGroups: e.target.checked })}
        />
        Respond in group chats
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.respondOnlyWhenMentioned}
          onChange={(e) => onConfigChange({ ...config, respondOnlyWhenMentioned: e.target.checked })}
          disabled={!config.respondToGroups}
        />
        In groups, respond only when someone mentions the bot
      </label>

      <label className="text-xs text-ink-700">
        Allowed Users (comma separated phone numbers with country code)
        <textarea
          className="mt-1 min-h-16 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.allowedUsers.join(",")}
          onChange={(e) =>
            onConfigChange({
              ...config,
              allowedUsers: e.target.value
                .split(",")
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0),
            })
          }
          placeholder="+15551234567,+15557654321"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.typingIndicator}
          onChange={(e) => onConfigChange({ ...config, typingIndicator: e.target.checked })}
        />
        Show typing indicator while generating response
      </label>

      <div className="rounded-lg border border-ink-900/10 bg-surface p-2 text-xs text-ink-700">
        <div className="font-semibold text-ink-900">Bridge Status</div>
        <div className="mt-1">State: {status?.state ?? "unknown"}</div>
        <div>Connected: {status?.connected ? "Yes" : "No"}</div>
        <div>Self JID: {status?.selfJid || "N/A"}</div>
        <div>QR Available: {status?.qrAvailable ? "Yes (scan below)" : "No"}</div>
        <div>Message: {status?.message || "N/A"}</div>
        {status?.lastError ? <div className="text-error">Error: {status.lastError}</div> : null}
      </div>

      {status?.qrDataUrl ? (
        <div className="rounded-lg border border-ink-900/10 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-ink-900">Scan This QR In WhatsApp</div>
          <div className="flex justify-center">
            <img
              src={status.qrDataUrl}
              alt="WhatsApp QR code"
              className="h-52 w-52 rounded-md border border-ink-900/10 bg-white p-1"
            />
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          onClick={onStart}
          disabled={isStarting || loading}
        >
          {isStarting ? "Starting..." : "Start WhatsApp"}
        </button>
        <button
          className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-tertiary disabled:opacity-60"
          onClick={onStop}
          disabled={isStopping || loading}
        >
          {isStopping ? "Stopping..." : "Stop WhatsApp"}
        </button>
      </div>
    </div>
  );
}
