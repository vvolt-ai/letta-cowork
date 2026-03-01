import { BrowserWindow } from "electron";
import {
  getChannelBridgeConfig,
  writeChannelBridgeConfig,
  type ChannelBridgeConfig,
  type WhatsAppBridgeConfig,
  type TelegramBridgeConfig,
  type DiscordBridgeConfig,
  type SlackBridgeConfig,
} from "./channelConfig.js";
import { WhatsAppBridge, type WhatsAppBridgeStatus } from "./whatsappBridge.js";
import { TelegramBridge, type TelegramBridgeStatus } from "./telegramBridge.js";
import { DiscordBridge, type DiscordBridgeStatus } from "./discordBridge.js";
import { SlackBridge, type SlackBridgeStatus } from "./slackBridge.js";

type BridgeStatusEvent = {
  type: "whatsapp-bridge-status";
  payload: WhatsAppBridgeStatus;
} | {
  type: "telegram-bridge-status";
  payload: TelegramBridgeStatus;
} | {
  type: "discord-bridge-status";
  payload: DiscordBridgeStatus;
} | {
  type: "slack-bridge-status";
  payload: SlackBridgeStatus;
};

const emitToRenderers = (event: BridgeStatusEvent): void => {
  const payload = JSON.stringify(event);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("server-event", payload);
  }
};

let currentConfig: ChannelBridgeConfig = getChannelBridgeConfig();

const whatsappBridge = new WhatsAppBridge((status) => {
  emitToRenderers({ type: "whatsapp-bridge-status", payload: status });
});

const telegramBridge = new TelegramBridge((status) => {
  emitToRenderers({ type: "telegram-bridge-status", payload: status });
});

const discordBridge = new DiscordBridge();
discordBridge.onStatus((status) => {
  emitToRenderers({ type: "discord-bridge-status", payload: status });
});

const slackBridge = new SlackBridge();
slackBridge.onStatus((status) => {
  emitToRenderers({ type: "slack-bridge-status", payload: status });
});

export const getBridgesConfig = (): ChannelBridgeConfig => currentConfig;

export const updateBridgesConfig = (nextConfig: ChannelBridgeConfig): ChannelBridgeConfig => {
  currentConfig = writeChannelBridgeConfig(nextConfig);
  return currentConfig;
};

export const getWhatsAppBridgeStatus = (): WhatsAppBridgeStatus => whatsappBridge.getStatus();

export const startWhatsAppBridge = async (): Promise<WhatsAppBridgeStatus> => {
  const config: WhatsAppBridgeConfig = currentConfig.whatsapp;
  const effectiveConfig: WhatsAppBridgeConfig = config.enabled
    ? config
    : { ...config, enabled: true };

  if (!config.enabled) {
    currentConfig = writeChannelBridgeConfig({
      ...currentConfig,
      whatsapp: effectiveConfig,
    });
  }

  return await whatsappBridge.start(effectiveConfig);
};

export const stopWhatsAppBridge = async (): Promise<WhatsAppBridgeStatus> => {
  return await whatsappBridge.stop();
};

export const getTelegramBridgeStatus = (): TelegramBridgeStatus => telegramBridge.getStatus();

export const startTelegramBridge = async (): Promise<TelegramBridgeStatus> => {
  const config: TelegramBridgeConfig = currentConfig.telegram;
  const effectiveConfig: TelegramBridgeConfig = config.enabled
    ? config
    : { ...config, enabled: true };

  if (!config.enabled) {
    currentConfig = writeChannelBridgeConfig({
      ...currentConfig,
      telegram: effectiveConfig,
    });
  }

  return await telegramBridge.start(effectiveConfig);
};

export const stopTelegramBridge = async (): Promise<TelegramBridgeStatus> => {
  return await telegramBridge.stop();
};

export const getDiscordBridgeStatus = (): DiscordBridgeStatus => discordBridge.getStatus();

export const startDiscordBridge = async (): Promise<DiscordBridgeStatus> => {
  const config: DiscordBridgeConfig = currentConfig.discord;
  const effectiveConfig: DiscordBridgeConfig = config.enabled
    ? config
    : { ...config, enabled: true };

  if (!config.enabled) {
    currentConfig = writeChannelBridgeConfig({
      ...currentConfig,
      discord: effectiveConfig,
    });
  }

  return await discordBridge.start(effectiveConfig);
};

export const stopDiscordBridge = async (): Promise<DiscordBridgeStatus> => {
  return await discordBridge.stop();
};

export const getSlackBridgeStatus = (): SlackBridgeStatus => slackBridge.getStatus();

export const startSlackBridge = async (): Promise<SlackBridgeStatus> => {
  const config: SlackBridgeConfig = currentConfig.slack;
  const effectiveConfig: SlackBridgeConfig = config.enabled
    ? config
    : { ...config, enabled: true };

  if (!config.enabled) {
    currentConfig = writeChannelBridgeConfig({
      ...currentConfig,
      slack: effectiveConfig,
    });
  }

  return await slackBridge.start(effectiveConfig);
};

export const stopSlackBridge = async (): Promise<SlackBridgeStatus> => {
  return await slackBridge.stop();
};

export const initializeChannelBridges = async (): Promise<void> => {
  currentConfig = getChannelBridgeConfig();
  if (currentConfig.whatsapp.enabled && currentConfig.whatsapp.autoStart) {
    try {
      await whatsappBridge.start(currentConfig.whatsapp);
    } catch (error) {
      console.error("Failed to auto-start WhatsApp bridge:", error);
    }
  }
  if (currentConfig.telegram.enabled && currentConfig.telegram.autoStart) {
    try {
      await telegramBridge.start(currentConfig.telegram);
    } catch (error) {
      console.error("Failed to auto-start Telegram bridge:", error);
    }
  }
  if (currentConfig.discord.enabled && currentConfig.discord.autoStart) {
    try {
      await discordBridge.start(currentConfig.discord);
    } catch (error) {
      console.error("Failed to auto-start Discord bridge:", error);
    }
  }
  if (currentConfig.slack.enabled && currentConfig.slack.autoStart) {
    try {
      await slackBridge.start(currentConfig.slack);
    } catch (error) {
      console.error("Failed to auto-start Slack bridge:", error);
    }
  }
};
