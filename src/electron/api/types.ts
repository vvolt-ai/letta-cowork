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
    organizationId: string;
    role: string;
  };
}

// ============================================
// Channel Types
// ============================================

export interface Channel {
  id: string;
  organizationId: string;
  createdByUserId: string;
  provider: 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'email' | 'custom';
  name: string;
  externalId: string | null;
  config: Record<string, unknown> | null;
  hasCredentials: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
