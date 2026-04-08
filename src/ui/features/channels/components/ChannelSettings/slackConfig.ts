// Slack Channel Configuration

export interface SlackConfig {
  enabled: boolean;
  autoStart: boolean;
  botToken: string;
  appToken: string;
  dmPolicy: "pairing" | "allowlist" | "open";
  respondToChannels: boolean;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
  channels: Record<string, { mode: "open" | "listen" | "mention-only" | "disabled"; allowedUsers?: string[] }>;
}

export interface SlackBridgeStatus {
  state: "stopped" | "starting" | "running" | "error";
  connected: boolean;
  botId: string;
  botUsername: string;
  workspaceName: string;
  message: string;
  lastError: string;
}

export const defaultSlackConfig = (): SlackConfig => ({
  enabled: false,
  autoStart: false,
  botToken: "",
  appToken: "",
  dmPolicy: "pairing",
  respondToChannels: true,
  allowedUsers: [],
  defaultAgentId: "",
  typingIndicator: true,
  channels: {},
});

export const SLACK_STEPS = [
  "Go to Slack API (api.slack.com/apps)",
  "Create a new App 'From scratch'",
  "Under 'OAuth & Permissions', add bot token scopes: app_mentions:read, chat:write, channels:read, groups:read, im:read, mpim:read, users:read",
  "Install the app to your workspace",
  "Copy the Bot User OAuth Token (starts with xoxb-)",
  "Go to 'Socket Mode' and enable it",
  "Copy the App-Level Token (starts with xapp-)",
  "Save both tokens and start the bridge",
];

export const SLACK_DOCS_URL = "https://docs.letta.com/channels/slack";
