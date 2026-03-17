import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  WhatsAppSettings,
  TelegramSettings,
  SlackSettings,
  DiscordSettings,
  CommonChannelSettings,
  ChannelType,
  ChannelConfig,
  ChannelConfigMap,
  DEFAULT_CONFIG,
  CHANNEL_LABELS,
  CHANNEL_STEPS,
  CHANNEL_DOCS_URLS,
  WhatsAppConfig,
  WhatsAppBridgeStatus,
  defaultWhatsAppConfig,
  TelegramConfig,
  TelegramBridgeStatus,
  defaultTelegramConfig,
  SlackConfig,
  SlackBridgeStatus,
  defaultSlackConfig,
  DiscordConfig,
  DiscordBridgeStatus,
  defaultDiscordConfig,
} from "./channel-settings";

const createDefaultMap = (): ChannelConfigMap => ({
  whatsapp: { ...DEFAULT_CONFIG },
  telegram: { ...DEFAULT_CONFIG },
  slack: { ...DEFAULT_CONFIG },
  discord: { ...DEFAULT_CONFIG },
});

interface ChannelSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialChannel: ChannelType;
  enabledChannels: ChannelType[];
}

export function ChannelSetupDialog({ open, onOpenChange, initialChannel, enabledChannels }: ChannelSetupDialogProps) {
  const [activeChannel, setActiveChannel] = useState<ChannelType>(initialChannel);
  const [configs, setConfigs] = useState<ChannelConfigMap>(() => createDefaultMap());
  const [whatsappConfig, setWhatsAppConfig] = useState<WhatsAppConfig>(() => defaultWhatsAppConfig());
  const [whatsappStatus, setWhatsAppStatus] = useState<WhatsAppBridgeStatus | null>(null);
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>(() => defaultTelegramConfig());
  const [telegramStatus, setTelegramStatus] = useState<TelegramBridgeStatus | null>(null);
  const [slackConfig, setSlackConfig] = useState<SlackConfig>(() => defaultSlackConfig());
  const [slackStatus, setSlackStatus] = useState<SlackBridgeStatus | null>(null);
  const [discordConfig, setDiscordConfig] = useState<DiscordConfig>(() => defaultDiscordConfig());
  const [discordStatus, setDiscordStatus] = useState<DiscordBridgeStatus | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const loadBridgeConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await window.electron.getChannelBridgesConfig() as ChannelBridgeConfig;
      setWhatsAppConfig(config.whatsapp);
      setTelegramConfig(config.telegram);
      setSlackConfig(config.slack);
      setDiscordConfig(config.discord);
      setConfigs({
        telegram: {
          enabled: config.telegram.enabled,
          botName: "Telegram Bridge",
          defaultAgentId: config.telegram.defaultAgentId,
          webhookUrl: "",
          token: config.telegram.botToken,
          signingSecret: "",
          extra: "",
        },
        slack: {
          enabled: config.slack.enabled,
          botName: "Slack Bridge",
          defaultAgentId: config.slack.defaultAgentId,
          webhookUrl: "",
          token: config.slack.botToken,
          signingSecret: "",
          extra: config.slack.autoStart ? "autoStart" : "",
        },
        discord: {
          enabled: config.discord.enabled,
          botName: "Discord Bridge",
          defaultAgentId: config.discord.defaultAgentId,
          webhookUrl: "",
          token: config.discord.botToken,
          signingSecret: "",
          extra: config.discord.autoStart ? "autoStart" : "",
        },
        whatsapp: {
          enabled: config.whatsapp.enabled,
          botName: "WhatsApp Bridge",
          defaultAgentId: config.whatsapp.defaultAgentId,
          webhookUrl: "",
          token: "",
          signingSecret: "",
          extra: "",
        },
      });
      const whatsappBridgeStatus = await window.electron.getWhatsAppBridgeStatus();
      setWhatsAppStatus(whatsappBridgeStatus);
      const telegramBridgeStatus = await window.electron.getTelegramBridgeStatus();
      setTelegramStatus(telegramBridgeStatus);
      const slackBridgeStatus = await window.electron.getSlackBridgeStatus();
      setSlackStatus(slackBridgeStatus);
      const discordBridgeStatus = await window.electron.getDiscordBridgeStatus();
      setDiscordStatus(discordBridgeStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSaveMessage("");
    void loadBridgeConfig();
  }, [loadBridgeConfig, open]);

  useEffect(() => {
    if (!open) return;
    if (enabledChannels.length === 0) return;
    const preferred = enabledChannels.includes(initialChannel) ? initialChannel : enabledChannels[0];
    setActiveChannel(preferred);
  }, [enabledChannels, initialChannel, open]);

  useEffect(() => {
    if (!open) return;
    if (enabledChannels.length === 0) return;
    if (!enabledChannels.includes(activeChannel)) {
      setActiveChannel(enabledChannels[0]);
    }
  }, [activeChannel, enabledChannels, open]);

  useEffect(() => {
    if (!open || activeChannel !== "whatsapp") return;
    const intervalId = setInterval(() => {
      window.electron
        .getWhatsAppBridgeStatus()
        .then((status) => setWhatsAppStatus(status))
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(intervalId);
  }, [activeChannel, open]);

  useEffect(() => {
    if (!open || activeChannel !== "telegram") return;
    const intervalId = setInterval(() => {
      window.electron
        .getTelegramBridgeStatus()
        .then((status) => setTelegramStatus(status))
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(intervalId);
  }, [activeChannel, open]);

  useEffect(() => {
    if (!open || activeChannel !== "slack") return;
    const intervalId = setInterval(() => {
      window.electron
        .getSlackBridgeStatus()
        .then((status) => setSlackStatus(status))
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(intervalId);
  }, [activeChannel, open]);

  // Discord status polling
  useEffect(() => {
    if (!open || activeChannel !== "discord") return;
    const intervalId = setInterval(() => {
      window.electron
        .getDiscordBridgeStatus()
        .then((status) => setDiscordStatus(status))
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(intervalId);
  }, [activeChannel, open]);

  const hasEnabledChannels = enabledChannels.length > 0;

  const currentConfig = useMemo(() => configs[activeChannel], [activeChannel, configs]);

  const updateField = (field: keyof ChannelConfig, value: string | boolean) => {
    setConfigs((prev) => ({
      ...prev,
      [activeChannel]: {
        ...prev[activeChannel],
        [field]: value,
      },
    }));
  };

  const saveCurrentChannel = async () => {
    const payload: ChannelBridgeConfig = {
      whatsapp: {
        ...whatsappConfig,
        sessionPath: whatsappConfig.sessionPath.trim(),
        defaultAgentId: whatsappConfig.defaultAgentId.trim(),
        allowedUsers: whatsappConfig.allowedUsers.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      },
      telegram: {
        ...telegramConfig,
        botToken: telegramConfig.botToken.trim(),
        defaultAgentId: telegramConfig.defaultAgentId.trim(),
        allowedUsers: telegramConfig.allowedUsers.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      },
      slack: {
        ...slackConfig,
        botToken: slackConfig.botToken.trim(),
        appToken: slackConfig.appToken.trim(),
        defaultAgentId: slackConfig.defaultAgentId.trim(),
        allowedUsers: slackConfig.allowedUsers.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
      },
      discord: {
        ...discordConfig,
        enabled: true,
        botToken: discordConfig.botToken.trim(),
        dmPolicy: discordConfig.dmPolicy,
        respondToGroups: discordConfig.respondToGroups,
        respondOnlyWhenMentioned: discordConfig.respondOnlyWhenMentioned,
        allowedUsers: discordConfig.allowedUsers.map((u: string) => u.trim()).filter(Boolean),
        groups: discordConfig.groups,
      },
    };

    await window.electron.updateChannelBridgesConfig(payload);
    setSaveMessage(`${CHANNEL_LABELS[activeChannel]} setup saved.`);
  };

  const openDocs = () => {
    void window.electron.openExternal(CHANNEL_DOCS_URLS[activeChannel]);
  };

  const startWhatsAppBridge = async () => {
    setIsStarting(true);
    setSaveMessage("");
    try {
      await saveCurrentChannel();
      const nextStatus = await window.electron.startWhatsAppBridge();
      setWhatsAppStatus(nextStatus);
      setSaveMessage("WhatsApp bridge started. Scan QR in terminal if prompted.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStarting(false);
    }
  };

  const stopWhatsAppBridge = async () => {
    setIsStopping(true);
    setSaveMessage("");
    try {
      const nextStatus = await window.electron.stopWhatsAppBridge();
      setWhatsAppStatus(nextStatus);
      setSaveMessage("WhatsApp bridge stopped.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStopping(false);
    }
  };

  if (!hasEnabledChannels) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-[94vw] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Channel Setup</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-6 rounded-xl border border-ink-900/10 bg-white/80 p-4 text-sm text-ink-700">
              Enable a channel in Cowork Settings to configure integrations.
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-60 w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-5 shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-ink-800">Channel Setup</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {enabledChannels.map((channel) => (
              <button
                key={channel}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  activeChannel === channel
                    ? "border-accent/40 bg-accent-subtle text-ink-900"
                    : "border-ink-900/10 bg-surface text-ink-700 hover:bg-surface-tertiary"
                }`}
                onClick={() => setActiveChannel(channel)}
              >
                {CHANNEL_LABELS[channel]}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="rounded-xl border border-ink-900/10 bg-white/80 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-ink-800">{CHANNEL_LABELS[activeChannel]} Bot Config</div>
                <label className="flex items-center gap-2 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    checked={activeChannel === "whatsapp" ? whatsappConfig.enabled : activeChannel === "telegram" ? telegramConfig.enabled : activeChannel === "slack" ? slackConfig.enabled : activeChannel === "discord" ? discordConfig.enabled : currentConfig.enabled}
                    onChange={(e) => {
                      if (activeChannel === "whatsapp") {
                        setWhatsAppConfig((prev) => ({ ...prev, enabled: e.target.checked }));
                        return;
                      }
                      if (activeChannel === "telegram") {
                        setTelegramConfig((prev) => ({ ...prev, enabled: e.target.checked }));
                        return;
                      }
                      if (activeChannel === "slack") {
                        setSlackConfig((prev) => ({ ...prev, enabled: e.target.checked }));
                        return;
                      }
                      if (activeChannel === "discord") {
                        setDiscordConfig((prev) => ({ ...prev, enabled: e.target.checked }));
                        return;
                      }
                      updateField("enabled", e.target.checked);
                    }}
                  />
                  Enabled
                </label>
              </div>

              {activeChannel === "whatsapp" ? (
                <WhatsAppSettings
                  config={whatsappConfig}
                  status={whatsappStatus}
                  onConfigChange={setWhatsAppConfig}
                  onStart={startWhatsAppBridge}
                  onStop={stopWhatsAppBridge}
                  isStarting={isStarting}
                  isStopping={isStopping}
                  loading={loading}
                />
              ) : activeChannel === "telegram" ? (
                <TelegramSettings
                  config={telegramConfig}
                  onConfigChange={setTelegramConfig}
                  status={telegramStatus}
                  onStart={async () => {
                    try {
                      setSaveMessage("Saving...");
                      await saveCurrentChannel();
                      const status = await window.electron.startTelegramBridge();
                      setTelegramStatus(status);
                      setSaveMessage(`Telegram bridge started. State: ${status.state}`);
                    } catch (error) {
                      setSaveMessage(error instanceof Error ? error.message : String(error));
                    }
                  }}
                  onStop={async () => {
                    try {
                      const status = await window.electron.stopTelegramBridge();
                      setTelegramStatus(status);
                      setSaveMessage(`Telegram bridge stopped. State: ${status.state}`);
                    } catch (error) {
                      setSaveMessage(error instanceof Error ? error.message : String(error));
                    }
                  }}
                  isStarting={isStarting}
                  isStopping={isStopping}
                  loading={loading}
                />
              ) : activeChannel === "discord" ? (
                <DiscordSettings
                  config={discordConfig}
                  setConfig={setDiscordConfig}
                  status={discordStatus}
                  onStart={async () => {
                    try {
                      setSaveMessage("Saving...");
                      await saveCurrentChannel();
                      const status = await window.electron.startDiscordBridge();
                      setDiscordStatus(status);
                      setSaveMessage(`Discord bridge started. State: ${status.state}`);
                    } catch (error) {
                      setSaveMessage(error instanceof Error ? error.message : String(error));
                    }
                  }}
                  onStop={async () => {
                    try {
                      const status = await window.electron.stopDiscordBridge();
                      setDiscordStatus(status);
                      setSaveMessage(`Discord bridge stopped. State: ${status.state}`);
                    } catch (error) {
                      setSaveMessage(error instanceof Error ? error.message : String(error));
                    }
                  }}
                />
              ) : activeChannel === "slack" ? (
                <SlackSettings
                  config={slackConfig}
                  setConfig={setSlackConfig}
                  status={slackStatus}
                  onStart={async () => {
                    try {
                      setSaveMessage("Saving...");
                      await saveCurrentChannel();
                      const status = await window.electron.startSlackBridge();
                      setSlackStatus(status);
                      setSaveMessage(`Slack bridge started. State: ${status.state}`);
                    } catch (error) {
                      setSaveMessage(error instanceof Error ? error.message : String(error));
                    }
                  }}
                  onStop={async () => {
                    try {
                      const status = await window.electron.stopSlackBridge();
                      setSlackStatus(status);
                      setSaveMessage(`Slack bridge stopped. State: ${status.state}`);
                    } catch (error) {
                      setSaveMessage(error instanceof Error ? error.message : String(error));
                    }
                  }}
                />
              ) : (
                <CommonChannelSettings
                  config={currentConfig}
                  channelType={activeChannel}
                  onChange={updateField}
                />
              )}
            </div>

            <div className="rounded-xl border border-ink-900/10 bg-surface p-3">
              <div className="text-sm font-semibold text-ink-800">Setup Checklist</div>
              <div className="mt-2 flex flex-col gap-2">
                {CHANNEL_STEPS[activeChannel].map((step, index) => (
                  <div key={step} className="rounded-lg border border-ink-900/10 bg-white px-2.5 py-2 text-xs text-ink-700">
                    <span className="font-semibold text-ink-900">{index + 1}. </span>
                    {step}
                  </div>
                ))}
              </div>
              <button
                className="mt-3 w-full rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-tertiary"
                onClick={openDocs}
              >
                Open {CHANNEL_LABELS[activeChannel]} Docs
              </button>
            </div>
          </div>

          {saveMessage && <div className="mt-3 text-xs text-success">{saveMessage}</div>}
          {loading && <div className="mt-2 text-xs text-muted">Loading channel setup...</div>}

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="rounded-lg border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-surface-tertiary transition-colors">
                Close
              </button>
            </Dialog.Close>
            <button
              className="rounded-lg bg-accent px-3 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
              onClick={() => {
                void saveCurrentChannel();
              }}
            >
              Save Setup
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
