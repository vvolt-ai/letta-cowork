// Channel Settings Components
export { WhatsAppSettings } from "./WhatsAppSettings";
export { TelegramSettings } from "./TelegramSettings";
export { SlackSettings } from "./SlackSettings";
export { DiscordSettings } from "./DiscordSettings";
export { CommonChannelSettings } from "./CommonChannelSettings";

// Channel Configuration
export * from "./channelConfig";
export * from "./whatsappConfig";
export * from "./telegramConfig";
export * from "./slackConfig";
export * from "./discordConfig";

// Re-export with alias for backwards compatibility
export { CHANNEL_STEPS, CHANNEL_DOCS_URLS as CHANNEL_DOCS } from "./channelConfig";
