import type { TelegramConfig, TelegramBridgeStatus } from "./telegramConfig";
import { defaultTelegramConfig } from "./telegramConfig";

// Re-export for convenience
export { defaultTelegramConfig };

export type { TelegramConfig, TelegramBridgeStatus };

export const TELEGRAM_DEFAULT_CONFIG = defaultTelegramConfig();

interface TelegramSettingsProps {
  config: TelegramConfig;
  status: TelegramBridgeStatus | null;
  onConfigChange: (config: TelegramConfig) => void;
  onStart: () => void;
  onStop: () => void;
  isStarting: boolean;
  isStopping: boolean;
  loading: boolean;
  agents?: Array<{ id: string; name: string }>;
}

export function TelegramSettings({
  config,
  status,
  onConfigChange,
  onStart,
  onStop,
  isStarting,
  isStopping,
  loading,
  agents = [],
}: TelegramSettingsProps) {
  const handleChange = (field: keyof TelegramConfig, value: string | boolean | string[]) => {
    onConfigChange({ ...config, [field]: value });
  };

  const isRunning = status?.state === "running" || status?.state === "connected";

  return (
    <div className="mt-3 grid gap-2">
      <label className="text-xs text-ink-700">
        Bot Token
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.botToken}
          onChange={(e) => handleChange("botToken", e.target.value)}
          placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
          disabled={isRunning}
        />
        <span className="text-xs text-ink-500">Get your bot token from @BotFather on Telegram</span>
      </label>

      <label className="text-xs text-ink-700">
        Default Agent ID
        <select
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.defaultAgentId}
          onChange={(e) => handleChange("defaultAgentId", e.target.value)}
        >
          <option value="">-- Select Agent --</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-500">Optional: Agent ID to use by default for Telegram messages</span>
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.autoStart}
          onChange={(e) => handleChange("autoStart", e.target.checked)}
        />
        Auto-start on app launch
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.respondToGroups}
          onChange={(e) => handleChange("respondToGroups", e.target.checked)}
        />
        Respond in group chats
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.respondOnlyWhenMentioned}
          onChange={(e) => handleChange("respondOnlyWhenMentioned", e.target.checked)}
          disabled={!config.respondToGroups}
        />
        Only respond when mentioned (@bot)
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.typingIndicator}
          onChange={(e) => handleChange("typingIndicator", e.target.checked)}
        />
        Show typing indicator while generating response
      </label>

      <label className="text-xs text-ink-700">
        Allowed Users (comma-separated)
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.allowedUsers.join(", ")}
          onChange={(e) =>
            handleChange(
              "allowedUsers",
              e.target.value.split(",").map((u: string) => u.trim()).filter(Boolean)
            )
          }
          placeholder="user1, user2, @username"
        />
        <span className="text-xs text-ink-500">Leave empty to allow all users</span>
      </label>

      <div className="rounded-lg border border-ink-900/10 bg-surface p-2 text-xs text-ink-700">
        <div className="font-semibold text-ink-900">Bridge Status</div>
        <div className="mt-1">State: {status?.state ?? "unknown"}</div>
        <div>Connected: {status?.connected ? "Yes" : "No"}</div>
        {status?.botUsername && <div>Bot: @{status.botUsername}</div>}
        <div>Message: {status?.message || "N/A"}</div>
        {status?.lastError ? <div className="text-error">Error: {status.lastError}</div> : null}
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          onClick={onStart}
          disabled={!config.botToken || isStarting || loading}
        >
          {isStarting ? "Starting..." : "Start Bridge"}
        </button>
        <button
          className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-tertiary disabled:opacity-60"
          onClick={onStop}
          disabled={isStopping || loading}
        >
          {isStopping ? "Stopping..." : "Stop Bridge"}
        </button>
      </div>
    </div>
  );
}
