import type { ChannelConfig, ChannelType } from "./channelConfig";

interface CommonChannelSettingsProps {
  config: ChannelConfig;
  channelType: ChannelType;
  onChange: (field: keyof ChannelConfig, value: string) => void;
}

export function CommonChannelSettings({
  config,
  channelType,
  onChange,
}: CommonChannelSettingsProps) {
  const channelNames: Record<ChannelType, string> = {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    slack: "Slack",
    discord: "Discord",
  };

  return (
    <div className="mt-3 grid gap-2">
      <label className="text-xs text-ink-700">
        Bot Name
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.botName}
          onChange={(e) => onChange("botName", e.target.value)}
          placeholder={`${channelNames[channelType]} Assistant`}
        />
      </label>
      <label className="text-xs text-ink-700">
        Default Letta Agent ID
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.defaultAgentId}
          onChange={(e) => onChange("defaultAgentId", e.target.value)}
          placeholder="agent-xxxx"
        />
      </label>
      <label className="text-xs text-ink-700">
        Webhook URL
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.webhookUrl}
          onChange={(e) => onChange("webhookUrl", e.target.value)}
          placeholder="https://your-domain.com/webhooks/..."
        />
      </label>
      <label className="text-xs text-ink-700">
        Token / Bot Secret
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.token}
          onChange={(e) => onChange("token", e.target.value)}
          placeholder="Paste token"
        />
      </label>
      <label className="text-xs text-ink-700">
        Signing Secret (optional)
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.signingSecret}
          onChange={(e) => onChange("signingSecret", e.target.value)}
          placeholder="Paste signing secret"
        />
      </label>
      <label className="text-xs text-ink-700">
        Extra (Channel ID / Phone ID / Guild ID)
        <input
          className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-800 outline-none focus:border-accent/40"
          value={config.extra}
          onChange={(e) => onChange("extra", e.target.value)}
          placeholder="Optional channel-specific value"
        />
      </label>
    </div>
  );
}
