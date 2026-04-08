/**
 * Processed Email Endpoints
 * 
 * Provides operations for tracking processed emails and email configuration.
 */

import type { BaseHttpClient } from "../client/base-client.js";
import type { AutoSyncEmailConfig, ProcessedEmailRecord, EmailTokens } from "../types.js";

/**
 * Processed Email Endpoints Mixin
 * 
 * Provides processed email tracking API methods when mixed with BaseHttpClient.
 */
export class ProcessedEmailEndpoints {
  // ============================================
  // Email Configuration
  // ============================================

  static async getEmailConfig(client: BaseHttpClient): Promise<AutoSyncEmailConfig> {
    const response = await client.request<{
      channelId?: string | null;
      enabled?: boolean;
      agentIds?: string[];
      routingRules?: Array<{ fromPattern: string; agentId: string }>;
      sinceDate?: string;
      processingMode?: 'unread_only' | 'today_all';
      markAsReadAfterProcess?: boolean;
    }>('/channels/email/config');
    
    return {
      channelId: response?.channelId ?? null,
      enabled: response?.enabled ?? false,
      agentIds: response?.agentIds ?? [],
      routingRules: response?.routingRules ?? [],
      sinceDate: response?.sinceDate ?? '',
      processingMode: response?.processingMode ?? 'unread_only',
      markAsReadAfterProcess: response?.markAsReadAfterProcess ?? true,
    };
  }

  static async updateEmailConfig(
    client: BaseHttpClient,
    config: Partial<AutoSyncEmailConfig>
  ): Promise<AutoSyncEmailConfig> {
    const response = await client.request<{
      channelId?: string | null;
      enabled?: boolean;
      agentIds?: string[];
      routingRules?: Array<{ fromPattern: string; agentId: string }>;
      sinceDate?: string;
      processingMode?: 'unread_only' | 'today_all';
      markAsReadAfterProcess?: boolean;
    }>('/channels/email/config', {
      method: 'PUT',
      body: config,
    });
    
    return {
      channelId: response?.channelId ?? null,
      enabled: response?.enabled ?? false,
      agentIds: response?.agentIds ?? [],
      routingRules: response?.routingRules ?? [],
      sinceDate: response?.sinceDate ?? '',
      processingMode: response?.processingMode ?? 'unread_only',
      markAsReadAfterProcess: response?.markAsReadAfterProcess ?? true,
    };
  }

  // ============================================
  // Processed Email IDs
  // ============================================

  static async getProcessedEmailIds(
    client: BaseHttpClient,
    accountId: string,
    folderId: string
  ): Promise<string[]> {
    const response = await client.request<{ ids?: string[] }>(
      `/channels/email/processed-ids/${accountId}/${folderId}`
    );
    return response?.ids || [];
  }

  static async getProcessedEmailDetails(
    client: BaseHttpClient,
    accountId: string,
    folderId: string
  ): Promise<ProcessedEmailRecord[]> {
    const response = await client.request<{ records?: ProcessedEmailRecord[] }>(
      `/channels/email/processed-ids/${accountId}/${folderId}?includeDetails=true`
    );
    return response?.records || [];
  }

  static async setProcessedEmailIds(
    client: BaseHttpClient,
    accountId: string,
    folderId: string,
    ids: string[],
    conversationId?: string,
    agentId?: string
  ): Promise<void> {
    await client.request<void>(`/channels/email/processed-ids/${accountId}/${folderId}`, {
      method: 'PUT',
      body: { ids, conversationId, agentId },
    });
  }

  static async markEmailAsProcessed(
    client: BaseHttpClient,
    accountId: string,
    folderId: string,
    messageId: string,
    conversationId?: string,
    agentId?: string
  ): Promise<{ success: boolean; id?: string }> {
    return client.request<{ success: boolean; id?: string }>(
      `/channels/email/processed-ids/${accountId}/${folderId}/${messageId}`,
      {
        method: 'POST',
        body: { conversationId, agentId },
      }
    );
  }

  static async getProcessedEmailByMessageId(
    client: BaseHttpClient,
    accountId: string,
    folderId: string,
    messageId: string
  ): Promise<ProcessedEmailRecord | null> {
    try {
      return await client.request<ProcessedEmailRecord>(
        `/channels/email/processed-ids/${accountId}/${folderId}/${messageId}`
      );
    } catch {
      // Return null if not found
      return null;
    }
  }

  static async clearProcessedEmailIds(
    client: BaseHttpClient,
    accountId: string,
    folderId: string
  ): Promise<void> {
    await client.request<void>(`/channels/email/processed-ids/${accountId}/${folderId}`, {
      method: 'DELETE',
    });
  }

  // ============================================
  // Email Token Storage
  // ============================================

  static async storeEmailTokens(
    client: BaseHttpClient,
    tokens: EmailTokens
  ): Promise<{ success: boolean; channelId?: string }> {
    return client.request<{ success: boolean; channelId?: string }>(
      '/channels/email/tokens',
      {
        method: 'PUT',
        body: tokens,
      }
    );
  }

  static async getEmailTokenMetadata(client: BaseHttpClient): Promise<{ hasCredentials: boolean }> {
    return client.request<{ hasCredentials: boolean }>('/channels/email/tokens');
  }

  static async deleteEmailTokens(client: BaseHttpClient): Promise<{ success: boolean }> {
    return client.request<{ success: boolean }>('/channels/email/tokens', {
      method: 'DELETE',
    });
  }
}
