import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export type WhatsAppBridgeConfig = {
  enabled: boolean;
  selfChatMode: boolean;
  autoStart: boolean;
  respondToGroups: boolean;
  respondOnlyWhenMentioned: boolean;
  sessionPath: string;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
};

export type TelegramBridgeConfig = {
  enabled: boolean;
  autoStart: boolean;
  botToken: string;
  respondToGroups: boolean;
  respondOnlyWhenMentioned: boolean;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
};

export type DiscordBridgeConfig = {
  enabled: boolean;
  autoStart: boolean;
  botToken: string;
  dmPolicy: "pairing" | "allowlist" | "open";
  respondToGroups: boolean;
  respondOnlyWhenMentioned: boolean;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
  groups: Record<string, { mode: "open" | "listen" | "mention-only" | "disabled"; allowedUsers?: string[] }>;
};

export type SlackBridgeConfig = {
  enabled: boolean;
  autoStart: boolean;
  botToken: string;
  appToken: string;
  allowedUsers: string[];
  defaultAgentId: string;
  typingIndicator: boolean;
};

export type PlaceholderChannelConfig = {
  enabled: boolean;
  botName: string;
  defaultAgentId: string;
  webhookUrl: string;
  token: string;
  signingSecret: string;
  extra: string;
};

export type ChannelBridgeConfig = {
  whatsapp: WhatsAppBridgeConfig;
  telegram: TelegramBridgeConfig;
  slack: SlackBridgeConfig;
  discord: DiscordBridgeConfig;
};

const CONFIG_PATH = join(homedir(), ".letta-cowork.channels.json");

const defaultPlaceholderChannel = (): PlaceholderChannelConfig => ({
  enabled: false,
  botName: "",
  defaultAgentId: "",
  webhookUrl: "",
  token: "",
  signingSecret: "",
  extra: "",
});

const defaultTelegramChannel = (): TelegramBridgeConfig => ({
  enabled: false,
  autoStart: false,
  botToken: "",
  respondToGroups: false,
  respondOnlyWhenMentioned: true,
  allowedUsers: [],
  defaultAgentId: process.env.LETTA_AGENT_ID?.trim() || "",
  typingIndicator: true,
});

const defaultDiscordChannel = (): DiscordBridgeConfig => ({
  enabled: false,
  autoStart: false,
  botToken: "",
  dmPolicy: "pairing",
  respondToGroups: true,
  respondOnlyWhenMentioned: false,
  allowedUsers: [],
  defaultAgentId: process.env.LETTA_AGENT_ID?.trim() || "",
  typingIndicator: true,
  groups: {},
});

const defaultSlackChannel = (): SlackBridgeConfig => ({
  enabled: false,
  autoStart: false,
  botToken: "",
  appToken: "",
  allowedUsers: [],
  defaultAgentId: process.env.LETTA_AGENT_ID?.trim() || "",
  typingIndicator: true,
});

export const getDefaultChannelBridgeConfig = (): ChannelBridgeConfig => ({
  whatsapp: {
    enabled: false,
    selfChatMode: true,
    autoStart: false,
    respondToGroups: false,
    respondOnlyWhenMentioned: true,
    sessionPath: join(process.cwd(), "data", "whatsapp-session"),
    allowedUsers: [],
    defaultAgentId: process.env.LETTA_AGENT_ID?.trim() || "",
    typingIndicator: true,
  },
  telegram: defaultTelegramChannel(),
  slack: defaultSlackChannel(),
  discord: defaultDiscordChannel(),
});

const normalizeAllowedUsers = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
};

const normalizePlaceholderChannel = (
  value: unknown,
  fallback: PlaceholderChannelConfig
): PlaceholderChannelConfig => {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<PlaceholderChannelConfig>;
  return {
    enabled: Boolean(raw.enabled),
    botName: String(raw.botName ?? ""),
    defaultAgentId: String(raw.defaultAgentId ?? ""),
    webhookUrl: String(raw.webhookUrl ?? ""),
    token: String(raw.token ?? ""),
    signingSecret: String(raw.signingSecret ?? ""),
    extra: String(raw.extra ?? ""),
  };
};

const normalizeTelegramChannel = (
  value: unknown,
  fallback: TelegramBridgeConfig
): TelegramBridgeConfig => {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<TelegramBridgeConfig>;
  return {
    enabled: Boolean(raw.enabled),
    autoStart: Boolean(raw.autoStart),
    botToken: String(raw.botToken ?? ""),
    respondToGroups: raw.respondToGroups !== undefined ? Boolean(raw.respondToGroups) : fallback.respondToGroups,
    respondOnlyWhenMentioned:
      raw.respondOnlyWhenMentioned !== undefined
        ? Boolean(raw.respondOnlyWhenMentioned)
        : fallback.respondOnlyWhenMentioned,
    allowedUsers: normalizeAllowedUsers(raw?.allowedUsers),
    defaultAgentId: String(raw.defaultAgentId ?? fallback.defaultAgentId),
    typingIndicator: raw.typingIndicator !== undefined ? Boolean(raw.typingIndicator) : fallback.typingIndicator,
  };
};

const normalizeDiscordChannel = (
  value: unknown,
  fallback: DiscordBridgeConfig
): DiscordBridgeConfig => {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<DiscordBridgeConfig>;
  return {
    enabled: Boolean(raw.enabled),
    autoStart: Boolean(raw.autoStart),
    botToken: String(raw.botToken ?? ""),
    dmPolicy: raw.dmPolicy === "pairing" || raw.dmPolicy === "allowlist" || raw.dmPolicy === "open" 
      ? raw.dmPolicy 
      : fallback.dmPolicy,
    respondToGroups: raw.respondToGroups !== undefined ? Boolean(raw.respondToGroups) : fallback.respondToGroups,
    respondOnlyWhenMentioned:
      raw.respondOnlyWhenMentioned !== undefined
        ? Boolean(raw.respondOnlyWhenMentioned)
        : fallback.respondOnlyWhenMentioned,
    allowedUsers: normalizeAllowedUsers(raw?.allowedUsers),
    defaultAgentId: String(raw.defaultAgentId ?? fallback.defaultAgentId),
    typingIndicator: raw.typingIndicator !== undefined ? Boolean(raw.typingIndicator) : fallback.typingIndicator,
    groups: raw.groups || fallback.groups,
  };
};

const normalizeSlackChannel = (
  value: unknown,
  fallback: SlackBridgeConfig
): SlackBridgeConfig => {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<SlackBridgeConfig>;
  return {
    enabled: Boolean(raw.enabled),
    autoStart: Boolean(raw.autoStart),
    botToken: String(raw.botToken ?? ""),
    appToken: String(raw.appToken ?? ""),
    allowedUsers: normalizeAllowedUsers(raw?.allowedUsers),
    defaultAgentId: String(raw.defaultAgentId ?? fallback.defaultAgentId),
    typingIndicator: raw.typingIndicator !== undefined ? Boolean(raw.typingIndicator) : fallback.typingIndicator,
  };
};

const normalizeConfig = (value: unknown): ChannelBridgeConfig => {
  const defaults = getDefaultChannelBridgeConfig();
  if (!value || typeof value !== "object") return defaults;

  const root = value as Partial<ChannelBridgeConfig>;
  const rawWhatsApp = root.whatsapp as Partial<WhatsAppBridgeConfig> | undefined;
  const rawTelegram = root.telegram as Partial<TelegramBridgeConfig> | undefined;
  const rawSlack = root.slack as Partial<SlackBridgeConfig> | undefined;
  const rawDiscord = root.discord as Partial<DiscordBridgeConfig> | undefined;

  return {
    whatsapp: {
      enabled: Boolean(rawWhatsApp?.enabled),
      selfChatMode: rawWhatsApp?.selfChatMode !== undefined ? Boolean(rawWhatsApp.selfChatMode) : defaults.whatsapp.selfChatMode,
      autoStart: Boolean(rawWhatsApp?.autoStart),
      respondToGroups: rawWhatsApp?.respondToGroups !== undefined ? Boolean(rawWhatsApp.respondToGroups) : defaults.whatsapp.respondToGroups,
      respondOnlyWhenMentioned:
        rawWhatsApp?.respondOnlyWhenMentioned !== undefined
          ? Boolean(rawWhatsApp.respondOnlyWhenMentioned)
          : defaults.whatsapp.respondOnlyWhenMentioned,
      sessionPath: String(rawWhatsApp?.sessionPath ?? defaults.whatsapp.sessionPath),
      allowedUsers: normalizeAllowedUsers(rawWhatsApp?.allowedUsers),
      defaultAgentId: String(rawWhatsApp?.defaultAgentId ?? defaults.whatsapp.defaultAgentId),
      typingIndicator: rawWhatsApp?.typingIndicator !== undefined ? Boolean(rawWhatsApp.typingIndicator) : defaults.whatsapp.typingIndicator,
    },
    telegram: normalizeTelegramChannel(rawTelegram, defaults.telegram),
    slack: normalizeSlackChannel(rawSlack, defaults.slack),
    discord: normalizeDiscordChannel(rawDiscord, defaults.discord),
  };
};

export const getChannelBridgeConfig = (): ChannelBridgeConfig => {
  try {
    if (!existsSync(CONFIG_PATH)) {
      const defaults = getDefaultChannelBridgeConfig();
      writeChannelBridgeConfig(defaults);
      return defaults;
    }
    const raw = readFileSync(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return getDefaultChannelBridgeConfig();
  }
};

export const writeChannelBridgeConfig = (config: ChannelBridgeConfig): ChannelBridgeConfig => {
  const normalized = normalizeConfig(config);
  const parentDir = dirname(CONFIG_PATH);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
};
