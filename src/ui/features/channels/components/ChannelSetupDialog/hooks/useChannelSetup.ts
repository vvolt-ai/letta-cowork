import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  ChannelBridgeConfig,
} from "../../ChannelSettings";

const createDefaultMap = (): ChannelConfigMap => ({
  whatsapp: { ...DEFAULT_CONFIG },
  telegram: { ...DEFAULT_CONFIG },
  slack: { ...DEFAULT_CONFIG },
  discord: { ...DEFAULT_CONFIG },
});

export interface UseChannelSetupOptions {
  open: boolean;
  initialChannel: ChannelType;
  availableChannels: ChannelType[];
}

export interface UseChannelSetupReturn {
  // State
  activeChannel: ChannelType;
  configs: ChannelConfigMap;
  whatsappConfig: WhatsAppConfig;
  whatsappStatus: WhatsAppBridgeStatus | null;
  telegramConfig: TelegramConfig;
  telegramStatus: TelegramBridgeStatus | null;
  slackConfig: SlackConfig;
  slackStatus: SlackBridgeStatus | null;
  discordConfig: DiscordConfig;
  discordStatus: DiscordBridgeStatus | null;
  saveMessage: string;
  loading: boolean;
  isStarting: boolean;
  isStopping: boolean;
  hasAvailableChannels: boolean;
  currentConfig: ChannelConfig;
  // Setters
  setActiveChannel: (channel: ChannelType) => void;
  setWhatsAppConfig: React.Dispatch<React.SetStateAction<WhatsAppConfig>>;
  setTelegramConfig: React.Dispatch<React.SetStateAction<TelegramConfig>>;
  setSlackConfig: React.Dispatch<React.SetStateAction<SlackConfig>>;
  setDiscordConfig: React.Dispatch<React.SetStateAction<DiscordConfig>>;
  // Actions
  updateField: (field: keyof ChannelConfig, value: string | boolean) => void;
  saveCurrentChannel: () => Promise<void>;
  openDocs: () => void;
  startWhatsAppBridge: () => Promise<void>;
  stopWhatsAppBridge: () => Promise<void>;
  startTelegramBridge: () => Promise<void>;
  stopTelegramBridge: () => Promise<void>;
  startSlackBridge: () => Promise<void>;
  stopSlackBridge: () => Promise<void>;
  startDiscordBridge: () => Promise<void>;
  stopDiscordBridge: () => Promise<void>;
  // Constants
  CHANNEL_LABELS: typeof CHANNEL_LABELS;
  CHANNEL_STEPS: typeof CHANNEL_STEPS;
}

export function useChannelSetup({
  open,
  initialChannel,
  availableChannels,
}: UseChannelSetupOptions): UseChannelSetupReturn {
  const [activeChannel, setActiveChannel] = useState<ChannelType>(initialChannel);
  const hasInitialized = useRef(false);
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
      const config = (await window.electron.getChannelBridgesConfig()) as ChannelBridgeConfig;
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

  // Initialize active channel only when dialog opens for the first time or when initialChannel changes while closed
  useEffect(() => {
    if (!open) {
      hasInitialized.current = false;
      return;
    }
    if (hasInitialized.current) return;
    if (availableChannels.length === 0) return;

    const preferred = availableChannels.includes(initialChannel) ? initialChannel : availableChannels[0];
    setActiveChannel(preferred);
    hasInitialized.current = true;
  }, [availableChannels, initialChannel, open]);

  // If active channel becomes invalid (removed from available), reset to first available
  useEffect(() => {
    if (!open) return;
    if (availableChannels.length === 0) return;
    if (!availableChannels.includes(activeChannel)) {
      setActiveChannel(availableChannels[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableChannels, open]);

  // WhatsApp status polling
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

  // Telegram status polling
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

  // Slack status polling
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

  const hasAvailableChannels = availableChannels.length > 0;

  const currentConfig = useMemo(() => configs[activeChannel], [activeChannel, configs]);

  const updateField = useCallback(
    (field: keyof ChannelConfig, value: string | boolean) => {
      setConfigs((prev) => ({
        ...prev,
        [activeChannel]: {
          ...prev[activeChannel],
          [field]: value,
        },
      }));
    },
    [activeChannel]
  );

  const saveCurrentChannel = useCallback(async () => {
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
  }, [activeChannel, discordConfig, slackConfig, telegramConfig, whatsappConfig]);

  const openDocs = useCallback(() => {
    void window.electron.openExternal(CHANNEL_DOCS_URLS[activeChannel]);
  }, [activeChannel]);

  const startWhatsAppBridge = useCallback(async () => {
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
  }, [saveCurrentChannel]);

  const stopWhatsAppBridge = useCallback(async () => {
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
  }, []);

  const startTelegramBridge = useCallback(async () => {
    try {
      setSaveMessage("Saving...");
      await saveCurrentChannel();
      const status = await window.electron.startTelegramBridge();
      setTelegramStatus(status);
      setSaveMessage(`Telegram bridge started. State: ${status.state}`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [saveCurrentChannel]);

  const stopTelegramBridge = useCallback(async () => {
    try {
      const status = await window.electron.stopTelegramBridge();
      setTelegramStatus(status);
      setSaveMessage(`Telegram bridge stopped. State: ${status.state}`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const startSlackBridge = useCallback(async () => {
    try {
      setSaveMessage("Saving...");
      await saveCurrentChannel();
      const status = await window.electron.startSlackBridge();
      setSlackStatus(status);
      setSaveMessage(`Slack bridge started. State: ${status.state}`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [saveCurrentChannel]);

  const stopSlackBridge = useCallback(async () => {
    try {
      const status = await window.electron.stopSlackBridge();
      setSlackStatus(status);
      setSaveMessage(`Slack bridge stopped. State: ${status.state}`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const startDiscordBridge = useCallback(async () => {
    try {
      setSaveMessage("Saving...");
      await saveCurrentChannel();
      const status = await window.electron.startDiscordBridge();
      setDiscordStatus(status);
      setSaveMessage(`Discord bridge started. State: ${status.state}`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, [saveCurrentChannel]);

  const stopDiscordBridge = useCallback(async () => {
    try {
      const status = await window.electron.stopDiscordBridge();
      setDiscordStatus(status);
      setSaveMessage(`Discord bridge stopped. State: ${status.state}`);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return {
    // State
    activeChannel,
    configs,
    whatsappConfig,
    whatsappStatus,
    telegramConfig,
    telegramStatus,
    slackConfig,
    slackStatus,
    discordConfig,
    discordStatus,
    saveMessage,
    loading,
    isStarting,
    isStopping,
    hasAvailableChannels,
    currentConfig,
    // Setters
    setActiveChannel,
    setWhatsAppConfig,
    setTelegramConfig,
    setSlackConfig,
    setDiscordConfig,
    // Actions
    updateField,
    saveCurrentChannel,
    openDocs,
    startWhatsAppBridge,
    stopWhatsAppBridge,
    startTelegramBridge,
    stopTelegramBridge,
    startSlackBridge,
    stopSlackBridge,
    startDiscordBridge,
    stopDiscordBridge,
    // Constants
    CHANNEL_LABELS,
    CHANNEL_STEPS,
  };
}
