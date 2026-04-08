// Telegram Channel Configuration

export interface TelegramConfig {
  enabled: boolean;
  autoStart: boolean;
  botToken: string;
  respondToGroups: boolean;
  respondOnlyWhenMentioned: boolean;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
}

export interface TelegramBridgeStatus {
  state: "stopped" | "starting" | "connected" | "reconnecting" | "running" | "error";
  connected: boolean;
  botId: number | string;
  botUsername: string;
  message: string;
  lastError: string;
  updatedAt?: number;
}

export const defaultTelegramConfig = (): TelegramConfig => ({
  enabled: false,
  autoStart: false,
  botToken: "",
  respondToGroups: true,
  respondOnlyWhenMentioned: false,
  allowedUsers: [],
  defaultAgentId: "",
  typingIndicator: true,
});

export const TELEGRAM_STEPS = [
  "Open Telegram and search for @BotFather",
  "Send /newbot to create a new bot",
  "Follow the instructions to name your bot and get the token",
  "Copy the bot token and paste it here",
  "Optionally add the bot to groups",
  "Configure allowed users and save",
];

export const TELEGRAM_DOCS_URL = "https://docs.letta.com/channels/telegram";
