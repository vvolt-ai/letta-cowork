import type { ChannelType, ChannelConfig } from "../ChannelSettings";
import {
  WhatsAppSettings,
  TelegramSettings,
  SlackSettings,
  DiscordSettings,
  CommonChannelSettings,
  CHANNEL_LABELS,
} from "../ChannelSettings";
import type {
  WhatsAppConfig,
  WhatsAppBridgeStatus,
  TelegramConfig,
  TelegramBridgeStatus,
  SlackConfig,
  SlackBridgeStatus,
  DiscordConfig,
  DiscordBridgeStatus,
} from "../ChannelSettings";

interface ChannelConfigFormProps {
  activeChannel: ChannelType;
  currentConfig: ChannelConfig;
  // WhatsApp
  whatsappConfig: WhatsAppConfig;
  whatsappStatus: WhatsAppBridgeStatus | null;
  setWhatsAppConfig: React.Dispatch<React.SetStateAction<WhatsAppConfig>>;
  onStartWhatsApp: () => Promise<void>;
  onStopWhatsApp: () => Promise<void>;
  // Telegram
  telegramConfig: TelegramConfig;
  telegramStatus: TelegramBridgeStatus | null;
  setTelegramConfig: React.Dispatch<React.SetStateAction<TelegramConfig>>;
  onStartTelegram: () => Promise<void>;
  onStopTelegram: () => Promise<void>;
  // Slack
  slackConfig: SlackConfig;
  slackStatus: SlackBridgeStatus | null;
  setSlackConfig: React.Dispatch<React.SetStateAction<SlackConfig>>;
  onStartSlack: () => Promise<void>;
  onStopSlack: () => Promise<void>;
  // Discord
  discordConfig: DiscordConfig;
  discordStatus: DiscordBridgeStatus | null;
  setDiscordConfig: React.Dispatch<React.SetStateAction<DiscordConfig>>;
  onStartDiscord: () => Promise<void>;
  onStopDiscord: () => Promise<void>;
  // Common
  isStarting: boolean;
  isStopping: boolean;
  loading: boolean;
  onUpdateField: (field: keyof ChannelConfig, value: string | boolean) => void;
}

export function ChannelConfigForm({
  activeChannel,
  currentConfig,
  whatsappConfig,
  whatsappStatus,
  setWhatsAppConfig,
  onStartWhatsApp,
  onStopWhatsApp,
  telegramConfig,
  telegramStatus,
  setTelegramConfig,
  onStartTelegram,
  onStopTelegram,
  slackConfig,
  slackStatus,
  setSlackConfig,
  onStartSlack,
  onStopSlack,
  discordConfig,
  discordStatus,
  setDiscordConfig,
  onStartDiscord,
  onStopDiscord,
  isStarting,
  isStopping,
  loading,
  onUpdateField,
}: ChannelConfigFormProps) {
  const renderEnabledCheckbox = () => {
    const isChecked =
      activeChannel === "whatsapp"
        ? whatsappConfig.enabled
        : activeChannel === "telegram"
          ? telegramConfig.enabled
          : activeChannel === "slack"
            ? slackConfig.enabled
            : activeChannel === "discord"
              ? discordConfig.enabled
              : currentConfig.enabled;

    const handleToggle = (checked: boolean) => {
      if (activeChannel === "whatsapp") {
        setWhatsAppConfig((prev) => ({ ...prev, enabled: checked }));
      } else if (activeChannel === "telegram") {
        setTelegramConfig((prev) => ({ ...prev, enabled: checked }));
      } else if (activeChannel === "slack") {
        setSlackConfig((prev) => ({ ...prev, enabled: checked }));
      } else if (activeChannel === "discord") {
        setDiscordConfig((prev) => ({ ...prev, enabled: checked }));
      } else {
        onUpdateField("enabled", checked);
      }
    };

    return (
      <label className="flex items-center gap-2 text-xs text-ink-700">
        <input type="checkbox" checked={isChecked} onChange={(e) => handleToggle(e.target.checked)} />
        Enabled
      </label>
    );
  };

  const renderSettings = () => {
    if (activeChannel === "whatsapp") {
      return (
        <WhatsAppSettings
          config={whatsappConfig}
          status={whatsappStatus}
          onConfigChange={setWhatsAppConfig}
          onStart={onStartWhatsApp}
          onStop={onStopWhatsApp}
          isStarting={isStarting}
          isStopping={isStopping}
          loading={loading}
        />
      );
    }

    if (activeChannel === "telegram") {
      return (
        <TelegramSettings
          config={telegramConfig}
          onConfigChange={setTelegramConfig}
          status={telegramStatus}
          onStart={onStartTelegram}
          onStop={onStopTelegram}
          isStarting={isStarting}
          isStopping={isStopping}
          loading={loading}
        />
      );
    }

    if (activeChannel === "discord") {
      return (
        <DiscordSettings
          config={discordConfig}
          setConfig={setDiscordConfig}
          status={discordStatus}
          onStart={onStartDiscord}
          onStop={onStopDiscord}
        />
      );
    }

    if (activeChannel === "slack") {
      return (
        <SlackSettings
          config={slackConfig}
          setConfig={setSlackConfig}
          status={slackStatus}
          onStart={onStartSlack}
          onStop={onStopSlack}
        />
      );
    }

    return <CommonChannelSettings config={currentConfig} channelType={activeChannel} onChange={onUpdateField} />;
  };

  return (
    <div className="rounded-xl border border-ink-900/10 bg-white/80 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink-800">{CHANNEL_LABELS[activeChannel]} Bot Config</div>
        {renderEnabledCheckbox()}
      </div>
      {renderSettings()}
    </div>
  );
}
