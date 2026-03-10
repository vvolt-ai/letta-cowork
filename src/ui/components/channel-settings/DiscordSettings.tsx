interface DiscordConfig {
  enabled: boolean;
  botToken: string;
  dmPolicy: "pairing" | "allowlist" | "open";
  autoStart: boolean;
  defaultAgentId: string;
  respondToGroups: boolean;
  allowedUsers: string[];
  typingIndicator: boolean;
  groups: Record<string, { mode: "open" | "listen" | "mention-only" | "disabled"; allowedUsers?: string[] }>;
}

import { AgentDropdown } from "../AgentDropdown";

interface DiscordBridgeStatus {
  state: "stopped" | "starting" | "running" | "error";
  connected: boolean;
  botId: string;
  botUsername: string;
  guildCount: number;
  message: string;
  lastError: string;
}

interface DiscordSettingsProps {
  config: DiscordConfig;
  setConfig: React.Dispatch<React.SetStateAction<DiscordConfig>>;
  status: DiscordBridgeStatus | null;
  onStart: () => void;
  onStop: () => void;
}

export function DiscordSettings({
  config,
  setConfig,
  status,
  onStart,
  onStop,
}: DiscordSettingsProps) {
  const handleChange = (field: keyof DiscordConfig, value: string | boolean | string[]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const isRunning = status?.state === "running";

  return (
    <div className="mt-3 grid gap-2">
      <div className="text-sm font-semibold text-ink-800 mb-2">Discord Bot Settings</div>
      
      <label className="text-xs text-ink-700">
        Bot Token
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.botToken}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("botToken", e.target.value)}
          placeholder="MTE..."
        />
        <span className="text-xs text-ink-500">Get from Discord Developer Portal → Bot → Reset Token</span>
      </label>

      <label className="text-xs text-ink-700">
        Default Agent ID
        <AgentDropdown
          value={config.defaultAgentId}
          onChange={(agentId) => handleChange("defaultAgentId", agentId)}
        />
      </label>

      <label className="text-xs text-ink-700">
        DM Policy
        <select
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.dmPolicy}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange("dmPolicy", e.target.value as "pairing" | "allowlist" | "open")}
        >
          <option value="pairing">Pairing (recommended) - requires approval</option>
          <option value="allowlist">Allowlist - only specific users</option>
          <option value="open">Open - anyone can message</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.autoStart}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("autoStart", e.target.checked)}
        />
        Auto-start bridge on app launch
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.respondToGroups}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("respondToGroups", e.target.checked)}
        />
        Respond in server channels
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.typingIndicator}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("typingIndicator", e.target.checked)}
        />
        Show typing indicator while generating response
      </label>

      <label className="text-xs text-ink-700">
        Allowed Users (comma separated Discord user IDs)
        <textarea
          className="mt-1 min-h-16 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.allowedUsers.join(",")}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            handleChange(
              "allowedUsers",
              e.target.value.split(",").map((u: string) => u.trim()).filter(Boolean)
            )
          }
          placeholder="123456789012345678, 987654321098765432"
        />
        <span className="text-xs text-ink-500">Enable Developer Mode in Discord to copy User IDs</span>
      </label>

      {status && (
        <div className="rounded-lg border border-ink-900/10 bg-surface p-2 text-xs text-ink-700">
          <div className="font-semibold text-ink-900">Bridge Status</div>
          <div>State: {status.state}</div>
          <div>Connected: {status.connected ? "Yes" : "No"}</div>
          <div>Bot: {status.botUsername || "N/A"}</div>
          <div>Guilds: {status.guildCount}</div>
          {status.lastError ? <div className="text-error">Error: {status.lastError}</div> : null}
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          onClick={onStart}
          disabled={!config.botToken || isRunning}
        >
          {isRunning ? "Running" : "Start Bridge"}
        </button>
        <button
          className="flex-1 rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-surface-tertiary disabled:opacity-60"
          onClick={onStop}
          disabled={!isRunning}
        >
          Stop Bridge
        </button>
      </div>
    </div>
  );
}
