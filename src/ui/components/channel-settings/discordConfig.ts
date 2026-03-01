// Discord Channel Configuration

export interface DiscordConfig {
  enabled: boolean;
  autoStart: boolean;
  botToken: string;
  dmPolicy: "pairing" | "allowlist" | "open";
  respondToGroups: boolean;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
  groups: Record<string, { mode: "open" | "listen" | "mention-only" | "disabled"; allowedUsers?: string[] }>;
}

export interface DiscordBridgeStatus {
  state: "stopped" | "starting" | "running" | "error";
  connected: boolean;
  botId: string;
  botUsername: string;
  guildCount: number;
  message: string;
  lastError: string;
}

export const defaultDiscordConfig = (): DiscordConfig => ({
  enabled: false,
  autoStart: false,
  botToken: "",
  dmPolicy: "pairing",
  respondToGroups: true,
  allowedUsers: [],
  defaultAgentId: "",
  typingIndicator: true,
  groups: {},
});

export const DISCORD_STEPS = [
  "Go to Discord Developer Portal (discord.com/developers/applications)",
  "Create a new Application",
  "Go to 'Bot' and create a bot user",
  "Reset and copy the bot token",
  "Enable 'Message Content Intent' in Bot settings",
  "Invite the bot to your server with appropriate permissions",
  "Save the token and start the bridge",
];

export const DISCORD_DOCS_URL = "https://docs.letta.com/channels/discord";
