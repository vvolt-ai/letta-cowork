/**
 * Vera Cowork API Client
 * 
 * Main API client that combines base HTTP functionality with
 * all endpoint modules for a unified interface.
 */

import { BaseHttpClient } from "./base-client.js";
import { ChannelEndpoints } from "../endpoints/channels.js";
import { EmailEndpoints } from "../endpoints/emails.js";
import type { 
  AuthTokens, 
  Channel, 
  ChannelRuntimeStatus, 
  ChannelCredentials,
  MessageLog,
  ConversationContext
} from "../types.js";

/**
 * Vera Cowork API Client
 * 
 * Provides a unified interface for all Vera Cowork server API operations.
 */
export class VeraCoworkApiClient extends BaseHttpClient {
  // ============================================
  // Authentication
  // ============================================

  async login(email: string, password: string): Promise<AuthTokens> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Login failed: ${error}`);
    }

    const data = await response.json();
    this.tokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      user: data.user,
    };
    this.saveTokens();
    return this.tokens;
  }

  async register(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthTokens> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${error}`);
    }

    const result = await response.json();
    this.tokens = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
    this.saveTokens();
    return this.tokens;
  }

  async logout(): Promise<void> {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } finally {
      this.clearTokens();
    }
  }

  // ============================================
  // Channels - Delegate to ChannelEndpoints
  // ============================================

  async listChannels(): Promise<Channel[]> {
    return ChannelEndpoints.listChannels(this);
  }

  async createChannel(data: {
    provider: Channel["provider"];
    name: string;
    externalId?: string;
    config?: Record<string, unknown>;
  }): Promise<Channel> {
    return ChannelEndpoints.createChannel(this, data);
  }

  async getChannel(channelId: string): Promise<Channel> {
    return ChannelEndpoints.getChannel(this, channelId);
  }

  async deleteChannel(channelId: string): Promise<void> {
    return ChannelEndpoints.deleteChannel(this, channelId);
  }

  // ============================================
  // Channel Credentials
  // ============================================

  async getChannelCredentials(channelId: string): Promise<{
    channelId: string;
    hasCredentials: boolean;
    keyVersion: string | null;
    updatedAt: Date | null;
  }> {
    return ChannelEndpoints.getChannelCredentials(this, channelId);
  }

  async setChannelCredentials(
    channelId: string,
    credentials: ChannelCredentials
  ): Promise<{
    channel: Channel;
    credentials: {
      channelId: string;
      hasCredentials: boolean;
      keyVersion: string;
      updatedAt: Date;
    };
  }> {
    return ChannelEndpoints.setChannelCredentials(this, channelId, credentials);
  }

  async deleteChannelCredentials(channelId: string): Promise<void> {
    return ChannelEndpoints.deleteChannelCredentials(this, channelId);
  }

  async updateChannelConfig(channelId: string, config: Record<string, unknown>): Promise<Channel> {
    return ChannelEndpoints.updateChannelConfig(this, channelId, config);
  }

  // ============================================
  // Channel Runtime
  // ============================================

  async startChannel(channelId: string): Promise<ChannelRuntimeStatus> {
    return ChannelEndpoints.startChannel(this, channelId);
  }

  async stopChannel(channelId: string): Promise<ChannelRuntimeStatus> {
    return ChannelEndpoints.stopChannel(this, channelId);
  }

  async getChannelStatus(channelId: string): Promise<ChannelRuntimeStatus> {
    return ChannelEndpoints.getChannelStatus(this, channelId);
  }

  async getAllRuntimeStatus(): Promise<{
    channels: ChannelRuntimeStatus[];
    count: number;
  }> {
    return ChannelEndpoints.getAllRuntimeStatus(this);
  }

  // ============================================
  // Messages
  // ============================================

  async getMessageLogs(
    channelId: string,
    options?: {
      direction?: "inbound" | "outbound";
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    messages: MessageLog[];
    total: number;
  }> {
    return ChannelEndpoints.getMessageLogs(this, channelId, options);
  }

  async sendMessage(
    channelId: string,
    to: string,
    content: string
  ): Promise<{
    id: string;
    externalMessageId: string | null;
    status: string;
    createdAt: Date;
  }> {
    return ChannelEndpoints.sendMessage(this, channelId, to, content);
  }

  // ============================================
  // Conversation Context
  // ============================================

  async getConversationContext(
    channelId: string,
    options?: {
      limit?: number;
      since?: string;
    }
  ): Promise<ConversationContext> {
    return ChannelEndpoints.getConversationContext(this, channelId, options);
  }

  async getGroupConversationContext(
    channelId: string,
    groupId: string,
    options?: {
      limit?: number;
      since?: string;
    }
  ): Promise<ConversationContext> {
    return ChannelEndpoints.getGroupConversationContext(this, channelId, groupId, options);
  }

  // ============================================
  // Email Operations - Delegate to EmailEndpoints
  // ============================================

  async getEmailAccounts(channelId: string): Promise<{
    accounts: Array<{
      accountId: string;
      accountName: string;
      email: string;
      serviceProvider: string;
    }>;
  }> {
    return EmailEndpoints.getEmailAccounts(this, channelId);
  }

  async getEmailFolders(channelId: string, accountId?: string): Promise<{
    folders: Array<{
      folderId: string;
      folderName: string;
      folderType: string;
      unreadCount?: number;
      totalCount?: number;
    }>;
  }> {
    return EmailEndpoints.getEmailFolders(this, channelId, accountId);
  }

  async getEmails(
    channelId: string,
    options?: {
      folderId?: string;
      limit?: number;
      start?: number;
      status?: "read" | "unread" | "all";
    }
  ): Promise<{
    messages: Array<{
      messageId: string;
      subject: string;
      from: string;
      to: string;
      cc?: string;
      text?: string;
      html?: string;
      receivedTime: number;
      sentDate?: string;
      status: "read" | "unread";
      hasAttachment: boolean;
      attachments: Array<{
        attachmentId: string;
        name: string;
        contentType: string;
        size: number;
      }>;
      folderId?: string;
      accountId?: string;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    return EmailEndpoints.getEmails(this, channelId, options);
  }

  async getEmailById(
    channelId: string,
    messageId: string,
    options?: {
      accountId?: string;
      folderId?: string;
    }
  ): Promise<{
    messageId: string;
    subject: string;
    from: string;
    to: string;
    cc?: string;
    text?: string;
    html?: string;
    receivedTime: number;
    sentDate?: string;
    status: "read" | "unread";
    hasAttachment: boolean;
    attachments: Array<{
      attachmentId: string;
      name: string;
      contentType: string;
      size: number;
    }>;
    folderId?: string;
    accountId?: string;
  }> {
    return EmailEndpoints.getEmailById(this, channelId, messageId, options);
  }

  async searchEmails(
    channelId: string,
    searchKey: string,
    options?: {
      limit?: number;
      start?: number;
    }
  ): Promise<{
    messages: Array<{
      messageId: string;
      subject: string;
      from: string;
      to: string;
      receivedTime: number;
      status: "read" | "unread";
      hasAttachment: boolean;
    }>;
    total: number;
  }> {
    return EmailEndpoints.searchEmails(this, channelId, searchKey, options);
  }

  async getEmailAttachments(
    channelId: string,
    messageId: string,
    options?: {
      accountId?: string;
      folderId?: string;
    }
  ): Promise<{
    attachments: Array<{
      attachmentId: string;
      name: string;
      contentType: string;
      size: number;
    }>;
  }> {
    return EmailEndpoints.getEmailAttachments(this, channelId, messageId, options);
  }

  async downloadEmailAttachment(
    channelId: string,
    messageId: string,
    attachmentId: string,
    options?: {
      accountId?: string;
      folderId?: string;
    }
  ): Promise<{
    data: string;
    contentType: string;
    filename: string;
  }> {
    return EmailEndpoints.downloadEmailAttachment(this, channelId, messageId, attachmentId, options);
  }

  async triggerEmailSync(channelId: string): Promise<{
    success: boolean;
    message: string;
    status: ChannelRuntimeStatus;
  }> {
    return EmailEndpoints.triggerEmailSync(this, channelId);
  }

  async markEmailsAsRead(
    channelId: string,
    messageIds: string[]
  ): Promise<{
    success: boolean;
    messageIds: string[];
  }> {
    return EmailEndpoints.markEmailsAsRead(this, channelId, messageIds);
  }
}


