/**
 * Email Endpoints
 * 
 * Provides email operations via the Vera Cowork server API.
 */

import type { BaseHttpClient } from "../client/base-client.js";
import type { ChannelRuntimeStatus } from "../types.js";

/**
 * Email Endpoints Mixin
 * 
 * Provides email-related API methods when mixed with BaseHttpClient.
 */
export class EmailEndpoints {
  // ============================================
  // Email Accounts & Folders
  // ============================================

  static async getEmailAccounts(client: BaseHttpClient, channelId: string): Promise<{
    accounts: Array<{
      accountId: string;
      accountName: string;
      email: string;
      serviceProvider: string;
    }>;
  }> {
    return client.request(`/channels/${channelId}/email/accounts`);
  }

  static async getEmailFolders(
    client: BaseHttpClient,
    channelId: string,
    accountId?: string
  ): Promise<{
    folders: Array<{
      folderId: string;
      folderName: string;
      folderType: string;
      unreadCount?: number;
      totalCount?: number;
    }>;
  }> {
    const params = new URLSearchParams();
    if (accountId) params.append("accountId", accountId);
    const query = params.toString();
    return client.request(`/channels/${channelId}/email/folders${query ? `?${query}` : ""}`);
  }

  // ============================================
  // Email Messages
  // ============================================

  static async getEmails(
    client: BaseHttpClient,
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
    const params = new URLSearchParams();
    if (options?.folderId) params.append("folderId", options.folderId);
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.start) params.append("start", String(options.start));
    if (options?.status) params.append("status", options.status);
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/email/messages${query ? `?${query}` : ""}`);
  }

  static async getEmailById(
    client: BaseHttpClient,
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
    const params = new URLSearchParams();
    if (options?.accountId) params.append("accountId", options.accountId);
    if (options?.folderId) params.append("folderId", options.folderId);
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/email/messages/${messageId}${query ? `?${query}` : ""}`);
  }

  static async searchEmails(
    client: BaseHttpClient,
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
    const params = new URLSearchParams();
    params.append("searchKey", searchKey);
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.start) params.append("start", String(options.start));
    
    return client.request(`/channels/${channelId}/email/search?${params.toString()}`);
  }

  // ============================================
  // Email Attachments
  // ============================================

  static async getEmailAttachments(
    client: BaseHttpClient,
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
    const params = new URLSearchParams();
    if (options?.accountId) params.append("accountId", options.accountId);
    if (options?.folderId) params.append("folderId", options.folderId);
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/email/messages/${messageId}/attachments${query ? `?${query}` : ""}`);
  }

  static async downloadEmailAttachment(
    client: BaseHttpClient,
    channelId: string,
    messageId: string,
    attachmentId: string,
    options?: {
      accountId?: string;
      folderId?: string;
    }
  ): Promise<{
    data: string; // base64 encoded
    contentType: string;
    filename: string;
  }> {
    const params = new URLSearchParams();
    if (options?.accountId) params.append("accountId", options.accountId);
    if (options?.folderId) params.append("folderId", options.folderId);
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/email/messages/${messageId}/attachments/${attachmentId}${query ? `?${query}` : ""}`);
  }

  // ============================================
  // Email Operations
  // ============================================

  static async triggerEmailSync(client: BaseHttpClient, channelId: string): Promise<{
    success: boolean;
    message: string;
    status: ChannelRuntimeStatus;
  }> {
    return client.request(`/channels/${channelId}/email/sync`, {
      method: "POST",
    });
  }

  static async markEmailsAsRead(
    client: BaseHttpClient,
    channelId: string,
    messageIds: string[]
  ): Promise<{
    success: boolean;
    messageIds: string[];
  }> {
    return client.request(`/channels/${channelId}/email/mark-read`, {
      method: "POST",
      body: { messageIds },
    });
  }
}
