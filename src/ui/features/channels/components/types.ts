// Channel config types matching server
export interface WhatsAppConfig {
  selfChatMode?: boolean;
  autoStart?: boolean;
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  sessionPath?: string;
  allowedUsers?: string[];
  defaultAgentId?: string;
  remoteEnvironmentId?: string | null;
  typingIndicator?: boolean;
}

export interface TelegramConfig {
  autoStart?: boolean;
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  remoteEnvironmentId?: string | null;
  typingIndicator?: boolean;
}

export interface DiscordConfig {
  autoStart?: boolean;
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  remoteEnvironmentId?: string | null;
  typingIndicator?: boolean;
}

export interface SlackConfig {
  autoStart?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  remoteEnvironmentId?: string | null;
  typingIndicator?: boolean;
}

export interface WeChatConfig {
  autoStart?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  remoteEnvironmentId?: string | null;
  typingIndicator?: boolean;
  baseUrl?: string;
}

export type ChannelConfig = WhatsAppConfig | TelegramConfig | DiscordConfig | SlackConfig | WeChatConfig;

// Extended config type for state management
export type ConfigDataState = {
  defaultAgentId?: string;
  remoteEnvironmentId?: string | null;
  autoStart?: boolean;
  typingIndicator?: boolean;
  allowedUsers?: string[];
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  selfChatMode?: boolean;
  sessionPath?: string;
  baseUrl?: string;
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
};

export interface Channel {
  id: string;
  provider: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'wechat' | 'email';
  name: string;
  hasCredentials: boolean;
  isActive: boolean;
  config?: ChannelConfig;
  createdAt: string;
}

export interface ChannelStatus {
  channelId: string;
  provider: string;
  status: 'stopped' | 'starting' | 'connected' | 'qr' | 'reconnecting' | 'error';
  connected: boolean;
  qrDataUrl?: string;
  botId?: string;
  botUsername?: string;
  error?: string;
}


export interface RemoteEnvironment {
  id: string;
  name: string;
  machineId: string;
  status: 'online' | 'offline' | 'reconnecting' | string;
  capabilities?: string[];
  lastSeenAt?: string;
}

export interface LettaAgent {
  id: string;
  name: string;
}

export interface ChannelsManagerProps {
  onAuthError?: (error: Error) => void;
}

export const PROVIDERS: readonly { id: string; name: string; icon: string }[] = [
  { id: 'telegram', name: 'Telegram', icon: '📱' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
  { id: 'wechat', name: 'WeChat', icon: '💚' },
  { id: 'discord', name: 'Discord', icon: '🎮' },
  { id: 'slack', name: 'Slack', icon: '💼' },
];

export type ProviderId = typeof PROVIDERS[number]['id'];

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'password';
  required: boolean;
}
