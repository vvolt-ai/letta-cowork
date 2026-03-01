// Channel Configuration Index
// Export all channel configs from one place

export * from "./whatsappConfig";
export * from "./telegramConfig";
export * from "./slackConfig";
export * from "./discordConfig";

// Channel type for discriminated union
export type ChannelType = "whatsapp" | "telegram" | "slack" | "discord";

// Common channel config structure
export interface ChannelConfig {
  enabled: boolean;
  botName: string;
  defaultAgentId: string;
  webhookUrl: string;
  token: string;
  signingSecret: string;
  extra: string;
}

export const DEFAULT_CHANNEL_CONFIG: ChannelConfig = {
  enabled: false,
  botName: "",
  defaultAgentId: "",
  webhookUrl: "",
  token: "",
  signingSecret: "",
  extra: "",
};

// Channel labels for UI
export const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  slack: "Slack",
  discord: "Discord",
};

// Import steps from individual config files
export const CHANNEL_STEPS: Record<ChannelType, string[]> = {
  whatsapp: [
    "Download WhatsApp on your phone",
    "Open WhatsApp and go to Settings → Linked Devices",
    "Tap 'Link a Device' and scan the QR code",
    "Make sure to authorize the device",
    "Enter session path (or leave empty to use default)",
    "Save and start the bridge",
  ],
  telegram: [
    "Open Telegram and search for @BotFather",
    "Send /newbot to create a new bot",
    "Follow the instructions to name your bot and get the token",
    "Copy the bot token and paste it here",
    "Optionally add the bot to groups",
    "Configure allowed users and save",
  ],
  slack: [
    "Go to Slack API (api.slack.com/apps)",
    "Create a new App 'From scratch'",
    "Under 'OAuth & Permissions', add bot token scopes",
    "Install the app to your workspace",
    "Copy the Bot User OAuth Token (xoxb-)",
    "Enable Socket Mode and copy App-Level Token (xapp-)",
    "Save both tokens and start the bridge",
  ],
  discord: [
    "Go to Discord Developer Portal",
    "Create a new Application",
    "Go to 'Bot' and create a bot user",
    "Reset and copy the bot token",
    "Enable 'Message Content Intent' in Bot settings",
    "Invite the bot to your server",
    "Save the token and start the bridge",
  ],
};

export const CHANNEL_DOCS_URLS: Record<ChannelType, string> = {
  whatsapp: "https://docs.letta.com/channels/whatsapp",
  telegram: "https://docs.letta.com/channels/telegram",
  slack: "https://docs.letta.com/channels/slack",
  discord: "https://docs.letta.com/channels/discord",
};

// Import config types for ChannelBridgeConfig
export type { WhatsAppConfig, WhatsAppBridgeStatus } from "./whatsappConfig";
export type { TelegramConfig, TelegramBridgeStatus } from "./telegramConfig";
export type { SlackConfig, SlackBridgeStatus } from "./slackConfig";
export type { DiscordConfig, DiscordBridgeStatus } from "./discordConfig";

// Re-export config types
import type { WhatsAppConfig } from "./whatsappConfig";
import type { TelegramConfig } from "./telegramConfig";
import type { SlackConfig } from "./slackConfig";
import type { DiscordConfig } from "./discordConfig";

export interface ChannelBridgeConfig {
  whatsapp: WhatsAppConfig;
  telegram: TelegramConfig;
  slack: SlackConfig;
  discord: DiscordConfig;
}

export interface ChannelConfigMap {
  whatsapp: ChannelConfig;
  telegram: ChannelConfig;
  slack: ChannelConfig;
  discord: ChannelConfig;
}

export const DEFAULT_CONFIG: ChannelConfig = {
  enabled: false,
  botName: "",
  defaultAgentId: "",
  webhookUrl: "",
  token: "",
  signingSecret: "",
  extra: "",
};

// Channel icons (emoji)
export const CHANNEL_ICONS: Record<ChannelType, string> = {
  whatsapp: "💬",
  telegram: "✈️",
  slack: "💼",
  discord: "🎮",
};
