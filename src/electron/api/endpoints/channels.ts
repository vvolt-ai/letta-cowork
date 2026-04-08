/**
 * Channel Endpoints
 * 
 * Provides channel management, credentials, and runtime operations.
 */

import type { BaseHttpClient } from "../client/base-client.js";
import type { Channel, ChannelRuntimeStatus, ChannelCredentials, MessageLog, ConversationContext } from "../types.js";

/**
 * Channel Endpoints Mixin
 * 
 * Provides channel-related API methods when mixed with BaseHttpClient.
 */
export class ChannelEndpoints {
  // ============================================
  // Channel CRUD
  // ============================================

  static async listChannels(client: BaseHttpClient): Promise<Channel[]> {
    return client.request<Channel[]>("/channels");
  }

  static async createChannel(
    client: BaseHttpClient,
    data: {
      provider: Channel["provider"];
      name: string;
      externalId?: string;
      config?: Record<string, unknown>;
    }
  ): Promise<Channel> {
    return client.request<Channel>("/channels", {
      method: "POST",
      body: data,
    });
  }

  static async getChannel(client: BaseHttpClient, channelId: string): Promise<Channel> {
    return client.request<Channel>(`/channels/${channelId}`);
  }

  static async deleteChannel(client: BaseHttpClient, channelId: string): Promise<void> {
    await client.request(`/channels/${channelId}`, { method: "DELETE" });
  }

  // ============================================
  // Channel Credentials
  // ============================================

  static async getChannelCredentials(client: BaseHttpClient, channelId: string): Promise<{
    channelId: string;
    hasCredentials: boolean;
    keyVersion: string | null;
    updatedAt: Date | null;
  }> {
    return client.request(`/channels/${channelId}/credentials`);
  }

  static async setChannelCredentials(
    client: BaseHttpClient,
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
    return client.request(`/channels/${channelId}/credentials`, {
      method: "PUT",
      body: credentials,
    });
  }

  static async deleteChannelCredentials(client: BaseHttpClient, channelId: string): Promise<void> {
    await client.request(`/channels/${channelId}/credentials`, { method: "DELETE" });
  }

  static async updateChannelConfig(
    client: BaseHttpClient,
    channelId: string,
    config: Record<string, unknown>
  ): Promise<Channel> {
    return client.request<Channel>(`/channels/${channelId}/config`, {
      method: "PATCH",
      body: config,
    });
  }

  // ============================================
  // Channel Runtime
  // ============================================

  static async startChannel(client: BaseHttpClient, channelId: string): Promise<ChannelRuntimeStatus> {
    return client.request<ChannelRuntimeStatus>(`/channels/${channelId}/start`, {
      method: "POST",
    });
  }

  static async stopChannel(client: BaseHttpClient, channelId: string): Promise<ChannelRuntimeStatus> {
    return client.request<ChannelRuntimeStatus>(`/channels/${channelId}/stop`, {
      method: "POST",
    });
  }

  static async getChannelStatus(client: BaseHttpClient, channelId: string): Promise<ChannelRuntimeStatus> {
    return client.request<ChannelRuntimeStatus>(`/channels/${channelId}/status`);
  }

  static async getAllRuntimeStatus(client: BaseHttpClient): Promise<{
    channels: ChannelRuntimeStatus[];
    count: number;
  }> {
    return client.request("/channels/runtime/status");
  }

  // ============================================
  // Messages
  // ============================================

  static async getMessageLogs(
    client: BaseHttpClient,
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
    const params = new URLSearchParams();
    if (options?.direction) params.append("direction", options.direction);
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.offset) params.append("offset", String(options.offset));
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/messages${query ? `?${query}` : ""}`);
  }

  static async sendMessage(
    client: BaseHttpClient,
    channelId: string,
    to: string,
    content: string
  ): Promise<{
    id: string;
    externalMessageId: string | null;
    status: string;
    createdAt: Date;
  }> {
    return client.request(`/channels/${channelId}/send`, {
      method: "POST",
      body: { to, content },
    });
  }

  // ============================================
  // Conversation Context
  // ============================================

  static async getConversationContext(
    client: BaseHttpClient,
    channelId: string,
    options?: {
      limit?: number;
      since?: string;
    }
  ): Promise<ConversationContext> {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.since) params.append("since", options.since);
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/conversation${query ? `?${query}` : ""}`);
  }

  static async getGroupConversationContext(
    client: BaseHttpClient,
    channelId: string,
    groupId: string,
    options?: {
      limit?: number;
      since?: string;
    }
  ): Promise<ConversationContext> {
    const params = new URLSearchParams();
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.since) params.append("since", options.since);
    
    const query = params.toString();
    return client.request(`/channels/${channelId}/groups/${groupId}/conversation${query ? `?${query}` : ""}`);
  }
}
