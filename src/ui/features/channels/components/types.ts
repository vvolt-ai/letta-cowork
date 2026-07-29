// Channel config types matching server
export interface WhatsAppConfig {
  whatsappMode?: 'account' | 'agent_route';
  parentChannelId?: string;
  routeType?: 'dm_sender' | 'group_sender' | 'mention' | 'fallback';
  senderJid?: string;
  groupJid?: string;
  mentionAliases?: string[];
  replyAllowed?: boolean;
  routeUserId?: string;
  selfChatMode?: boolean;
  autoStart?: boolean;
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  sessionPath?: string;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

export interface TelegramConfig {
  autoStart?: boolean;
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

export interface DiscordConfig {
  autoStart?: boolean;
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

export interface SlackConfig {
  autoStart?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
}

export interface WeChatConfig {
  autoStart?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  typingIndicator?: boolean;
  baseUrl?: string;
}

export interface GmailConfig {
  autoStart?: boolean;
  allowedUsers?: string[];
  defaultAgentId?: string;
  syncMode?: 'unread_only' | 'all_since_date' | 'label';
  pollIntervalSeconds?: number;
  labelIds?: string[];
}

export type ChannelConfig = WhatsAppConfig | TelegramConfig | DiscordConfig | SlackConfig | WeChatConfig | GmailConfig;

// Extended config type for state management
export type ConfigDataState = {
  defaultAgentId?: string;
  autoStart?: boolean;
  typingIndicator?: boolean;
  allowedUsers?: string[];
  respondToGroups?: boolean;
  respondOnlyWhenMentioned?: boolean;
  selfChatMode?: boolean;
  sessionPath?: string;
  baseUrl?: string;
  syncMode?: 'unread_only' | 'all_since_date' | 'label';
  pollIntervalSeconds?: number;
  labelIds?: string[];
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
  whatsappMode?: 'account' | 'agent_route';
  parentChannelId?: string;
  routeType?: 'dm_sender' | 'group_sender' | 'mention' | 'fallback';
  senderJid?: string;
  groupJid?: string;
  mentionAliases?: string[];
  replyAllowed?: boolean;
  routeUserId?: string;
};

export interface Channel {
  id: string;
  provider: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'wechat' | 'email' | 'gmail';
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


export interface LettaAgent {
  id: string;
  name: string;
}

export interface OrganizationUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string | null;
  phoneNumber?: string | null;
  isActive: boolean;
  role?: string;
}

export interface ChannelsManagerProps {
  onAuthError?: (error: Error) => void;
  embedded?: boolean;
}

export const PROVIDERS: readonly { id: string; name: string; icon: string }[] = [
  { id: 'telegram', name: 'Telegram', icon: '📱' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '💬' },
  { id: 'wechat', name: 'WeChat', icon: '💚' },
  { id: 'gmail', name: 'Gmail', icon: '📧' },
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
