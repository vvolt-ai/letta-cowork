import type { SlackConfig, SlackBridgeStatus } from "./slackConfig";
import { defaultSlackConfig } from "./slackConfig";
import { AgentDropdown } from "../../../chat/components/AgentDropdown";

// Re-export for convenience
export { defaultSlackConfig };

export type { SlackConfig, SlackBridgeStatus };

export const SLACK_DEFAULT_CONFIG = defaultSlackConfig();

interface SlackSettingsProps {
  config: SlackConfig;
  setConfig: React.Dispatch<React.SetStateAction<SlackConfig>>;
  status: SlackBridgeStatus | null;
  onStart: () => void;
  onStop: () => void;
}

export function SlackSettings({
  config,
  setConfig,
  status,
  onStart,
  onStop,
}: SlackSettingsProps) {
  const handleChange = (field: keyof SlackConfig, value: string | boolean | string[]) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const isRunning = status?.state === "running";

  return (
    <div className="mt-3 grid gap-2">
      <div className="text-sm font-semibold text-ink-800 mb-2">Slack Bot Settings (Socket Mode)</div>
      
      <label className="text-xs text-ink-700">
        Bot Token (xoxb-)
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.botToken}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("botToken", e.target.value)}
          placeholder="xoxb-..."
        />
        <span className="text-xs text-ink-500">Get from Slack App → OAuth & Permissions → Bot User OAuth Token</span>
      </label>

      <label className="text-xs text-ink-700">
        App Token (xapp-)
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.appToken}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("appToken", e.target.value)}
          placeholder="xapp-..."
        />
        <span className="text-xs text-ink-500">Get from Slack App → Socket Mode → Generate App-Level Token</span>
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
          checked={config.respondToChannels}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("respondToChannels", e.target.checked)}
        />
        Respond to mentions in channels
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.typingIndicator}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("typingIndicator", e.target.checked)}
        />
        Show typing indicator while processing
      </label>

      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={config.autoStart}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange("autoStart", e.target.checked)}
        />
        Auto-start bridge on app launch
      </label>

      <div className="rounded-lg border border-ink-900/10 bg-surface p-2 text-xs text-ink-700">
        <div className="font-semibold text-ink-900">Bridge Status</div>
        <div>State: {status?.state ?? "unknown"}</div>
        <div>Connected: {status?.connected ? "Yes" : "No"}</div>
        {status?.botUsername ? <div>Bot: @{status.botUsername}</div> : null}
        {status?.workspaceName ? <div>Workspace: {status.workspaceName}</div> : null}
        {status?.lastError ? <div className="text-error">Error: {status.lastError}</div> : null}
      </div>

      <div className="flex gap-2">
        <button
          className="flex-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          onClick={onStart}
          disabled={!config.botToken || !config.appToken || isRunning}
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
