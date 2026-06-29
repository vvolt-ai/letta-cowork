/**
 * Shared API Types
 * 
 * Common types used across the API client layer.
 */

// ============================================
// Authentication Types
// ============================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string | null;
    phoneNumber?: string | null;
    organizationId: string;
    role: string;
  };
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

export interface AgentSecret {
  id: string;
  name: string;
  keyVersion?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UpsertAgentSecretInput {
  name: string;
  value: string;
}

// ============================================
// Super-admin Types
// ============================================

export interface AdminOverview {
  users: number;
  organizations: number;
  activeMemberships: number;
  channels: number;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string | null;
  phoneNumber?: string | null;
  isActive: boolean;
  role: 'super_admin' | 'organization_admin' | 'user' | string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  memberships?: AdminMembership[];
}

export interface AdminOrganization {
  id: string;
  name: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  members?: Array<AdminMembership & { user?: AdminUser | null }>;
}

export interface AdminMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: 'owner' | 'admin' | 'member' | string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  user?: AdminUser | null;
  organization?: AdminOrganization | null;
}

export interface AdminChannel {
  id: string;
  organizationId: string;
  organizationName?: string;
  createdByUserId: string;
  createdByUserEmail?: string;
  provider: Channel['provider'];
  name: string;
  externalId: string | null;
  config: Record<string, unknown> | null;
  hasCredentials: boolean;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AdminChannelShare {
  id: string;
  channelId: string;
  organizationId: string;
  sharedWithUserId: string;
  sharedWithUserEmail?: string;
  sharedByUserId: string;
  sharedByUserEmail?: string;
  permission: string;
  isActive: boolean;
  revokedAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AdminChannelInput {
  organizationId: string;
  createdByUserId: string;
  provider: Channel['provider'];
  name: string;
  externalId?: string | null;
  config?: Record<string, unknown> | null;
  credentials?: Record<string, string>;
  isActive?: boolean;
}

// ============================================
// Channel Types
// ============================================

export interface Channel {
  id: string;
  organizationId: string;
  createdByUserId: string;
  provider: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'wechat' | 'email' | 'gmail' | 'custom';
  name: string;
  externalId: string | null;
  config: Record<string, unknown> | null;
  hasCredentials: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  access?: {
    owner: boolean;
    permission: 'owner' | 'read' | 'write' | 'admin';
    sharedByUserId?: string;
    sharedAt?: Date | string;
  };
}

export interface ChannelShare {
  id: string;
  channelId: string;
  organizationId: string;
  sharedWithUserId: string;
  sharedWithUserEmail?: string;
  sharedByUserId: string;
  sharedByUserEmail?: string;
  permission: 'read' | 'write' | 'admin';
  isActive: boolean;
  revokedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ChannelRuntimeStatus {
  channelId: string;
  provider: string;
  status: 'stopped' | 'starting' | 'connected' | 'qr' | 'reconnecting' | 'error';
  connected: boolean;
  startedAt?: Date;
  lastActivityAt?: Date;
  error?: string;
  qrDataUrl?: string;
  botId?: string;
  botUsername?: string;
  selfJid?: string;
  teamId?: string;
  guildCount?: number;
}

export interface ChannelCredentials {
  credentials: Record<string, string>;
  secureConfig?: Record<string, unknown>;
}

export interface WeChatIlinkQrCodeResponse {
  qrcode: string;
  qrcodeImageUrl: string | null;
  qrcodeImageContent: string | null;
  baseUrl: string;
}

export interface WeChatIlinkQrStatusResponse {
  status: 'wait' | 'scanned' | 'confirmed' | 'expired' | string;
  accountId: string | null;
  botToken: string | null;
  userId: string | null;
  baseUrl: string;
}


// ============================================
// Message Types
// ============================================

export interface MessageLog {
  id: string;
  direction: 'inbound' | 'outbound';
  externalMessageId: string | null;
  from: string;
  to: string;
  content: string;
  contentType: string;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ConversationContext {
  messages: Array<{
    messageId: string;
    content: string;
    timestamp: Date;
    senderId: string;
    senderName?: string;
  }>;
  participants: Array<{
    senderId: string;
    senderName?: string;
    messageCount: number;
  }>;
}

// ============================================
// Email Types
// ============================================

export interface EmailAccount {
  accountId: string;
  accountName: string;
  email: string;
  serviceProvider: string;
}

export interface EmailFolder {
  folderId: string;
  folderName: string;
  folderType: string;
  unreadCount?: number;
  totalCount?: number;
}

export interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  text?: string;
  html?: string;
  receivedTime: number;
  sentDate?: string;
  status: 'read' | 'unread';
  hasAttachment: boolean;
  attachments: EmailAttachment[];
  folderId?: string;
  accountId?: string;
}

export interface EmailAttachment {
  attachmentId: string;
  name: string;
  contentType: string;
  size: number;
}

export interface EmailTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: number;
  accountId?: string;
  folderId?: string;
  email?: string;
}

// ============================================
// Processed Email Types
// ============================================

export interface AutoSyncEmailConfig {
  channelId?: string | null;
  enabled: boolean;
  agentIds: string[];
  routingRules: Array<{ fromPattern: string; agentId: string }>;
  sinceDate: string;
  processingMode: 'unread_only' | 'today_all';
  markAsReadAfterProcess: boolean;
}

export interface ProcessedEmailRecord {
  id: string;
  messageId: string;
  conversationId: string | null;
  agentId: string | null;
  processedAt: string;
}

// ============================================
// Request Options
// ============================================

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  requireAuth?: boolean;
  suppressAuthExpired?: boolean;
}
