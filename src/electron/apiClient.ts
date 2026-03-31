/**
 * Vera Cowork API Client
 * 
 * Connects to the vera-cowork-server API for:
 * - Authentication (login/register)
 * - Channel management
 * - Channel runtime (start/stop/status)
 * - Message logs
 * - Conversation context
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

// Types
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

// Storage path for tokens
const TOKENS_PATH = join(homedir(), ".letta-cowork", "api-tokens.json");

/**
 * Vera Cowork API Client
 */
export class VeraCoworkApiClient {
  private baseUrl: string;
  private tokens: AuthTokens | null = null;
  private refreshPromise: Promise<AuthTokens | null> | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.VERA_COWORK_API_URL || "https://vera-cowork-server.ngrok.app";
    this.loadTokens();
  }

  // ============================================
  // Token Management
  // ============================================

  private loadTokens(): void {
    try {
      if (existsSync(TOKENS_PATH)) {
        const data = readFileSync(TOKENS_PATH, "utf8");
        this.tokens = JSON.parse(data);
      }
    } catch (error) {
      console.warn("Failed to load API tokens:", error);
      this.tokens = null;
    }
  }

  private saveTokens(): void {
    try {
      const dir = dirname(TOKENS_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(TOKENS_PATH, JSON.stringify(this.tokens, null, 2), "utf8");
    } catch (error) {
      console.error("Failed to save API tokens:", error);
    }
  }

  clearTokens(): void {
    this.tokens = null;
    try {
      if (existsSync(TOKENS_PATH)) {
        writeFileSync(TOKENS_PATH, "{}", "utf8");
      }
    } catch (error) {
      console.warn("Failed to clear token file:", error);
    }
  }

  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.accessToken !== "";
  }

  get currentUser(): AuthTokens["user"] | null {
    return this.tokens?.user || null;
  }

  // ============================================
  // HTTP Methods
  // ============================================

  async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
      requireAuth?: boolean;
    } = {}
  ): Promise<T> {
    const { method = "GET", body, requireAuth = true } = options;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requireAuth && this.tokens?.accessToken) {
      headers["Authorization"] = `Bearer ${this.tokens.accessToken}`;
    }

    // Properly join URL parts
    const url = this.baseUrl.endsWith('/') && path.startsWith('/')
      ? `${this.baseUrl}${path.slice(1)}`
      : `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && this.tokens?.refreshToken) {
      const newTokens = await this.refreshAccessToken();
      if (newTokens) {
        // Retry with new token
        headers["Authorization"] = `Bearer ${newTokens.accessToken}`;
        const retryResponse = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!retryResponse.ok) {
          const error = await retryResponse.text();
          throw new Error(`API error: ${retryResponse.status} - ${error}`);
        }
        return retryResponse.json();
      } else {
        // Refresh failed, clear tokens
        this.clearTokens();
        throw new Error("Authentication expired. Please login again.");
      }
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  private async refreshAccessToken(): Promise<AuthTokens | null> {
    // Prevent concurrent refresh
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<AuthTokens | null> {
    if (!this.tokens?.refreshToken) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      this.tokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || this.tokens.refreshToken,
        expiresIn: data.expiresIn,
        user: data.user,
      };
      this.saveTokens();
      return this.tokens;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return null;
    }
  }

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
  // Channels
  // ============================================

  async listChannels(): Promise<Channel[]> {
    return this.request<Channel[]>("/channels");
  }

  async createChannel(data: {
    provider: Channel["provider"];
    name: string;
    externalId?: string;
    config?: Record<string, unknown>;
  }): Promise<Channel> {
    return this.request<Channel>("/channels", {
      method: "POST",
      body: data,
    });
  }

  async getChannel(channelId: string): Promise<Channel> {
    return this.request<Channel>(`/channels/${channelId}`);
  }

  async deleteChannel(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}`, { method: "DELETE" });
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
    return this.request(`/channels/${channelId}/credentials`);
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
    return this.request(`/channels/${channelId}/credentials`, {
      method: "PUT",
      body: credentials,
    });
  }

  async deleteChannelCredentials(channelId: string): Promise<void> {
    await this.request(`/channels/${channelId}/credentials`, { method: "DELETE" });
  }

  async updateChannelConfig(channelId: string, config: Record<string, any>): Promise<Channel> {
    return this.request<Channel>(`/channels/${channelId}/config`, {
      method: "PATCH",
      body: config,
    });
  }

  // ============================================
  // Channel Runtime
  // ============================================

  async startChannel(channelId: string): Promise<ChannelRuntimeStatus> {
    return this.request<ChannelRuntimeStatus>(`/channels/${channelId}/start`, {
      method: "POST",
    });
  }

  async stopChannel(channelId: string): Promise<ChannelRuntimeStatus> {
    return this.request<ChannelRuntimeStatus>(`/channels/${channelId}/stop`, {
      method: "POST",
    });
  }

  async getChannelStatus(channelId: string): Promise<ChannelRuntimeStatus> {
    return this.request<ChannelRuntimeStatus>(`/channels/${channelId}/status`);
  }

  async getAllRuntimeStatus(): Promise<{
    channels: ChannelRuntimeStatus[];
    count: number;
  }> {
    return this.request("/channels/runtime/status");
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
    const params = new URLSearchParams();
    if (options?.direction) params.append("direction", options.direction);
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.offset) params.append("offset", String(options.offset));
    
    const query = params.toString();
    return this.request(`/channels/${channelId}/messages${query ? `?${query}` : ""}`);
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
    return this.request(`/channels/${channelId}/send`, {
      method: "POST",
      body: { to, content },
    });
  }

  // ============================================
  // Conversation Context (Neo4j)
  // ============================================

  async getConversationContext(
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
    return this.request(`/channels/${channelId}/conversation${query ? `?${query}` : ""}`);
  }

  async getGroupConversationContext(
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
    return this.request(`/channels/${channelId}/groups/${groupId}/conversation${query ? `?${query}` : ""}`);
  }

  // ============================================
  // Email Operations (Server-Side)
  // ============================================

  async getEmailAccounts(channelId: string): Promise<{
    accounts: Array<{
      accountId: string;
      accountName: string;
      email: string;
      serviceProvider: string;
    }>;
  }> {
    return this.request(`/channels/${channelId}/email/accounts`);
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
    const params = new URLSearchParams();
    if (accountId) params.append("accountId", accountId);
    const query = params.toString();
    return this.request(`/channels/${channelId}/email/folders${query ? `?${query}` : ""}`);
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
    const params = new URLSearchParams();
    if (options?.folderId) params.append("folderId", options.folderId);
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.start) params.append("start", String(options.start));
    if (options?.status) params.append("status", options.status);
    
    const query = params.toString();
    return this.request(`/channels/${channelId}/email/messages${query ? `?${query}` : ""}`);
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
    const params = new URLSearchParams();
    if (options?.accountId) params.append("accountId", options.accountId);
    if (options?.folderId) params.append("folderId", options.folderId);
    
    const query = params.toString();
    return this.request(`/channels/${channelId}/email/messages/${messageId}${query ? `?${query}` : ""}`);
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
    const params = new URLSearchParams();
    params.append("searchKey", searchKey);
    if (options?.limit) params.append("limit", String(options.limit));
    if (options?.start) params.append("start", String(options.start));
    
    return this.request(`/channels/${channelId}/email/search?${params.toString()}`);
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
    const params = new URLSearchParams();
    if (options?.accountId) params.append("accountId", options.accountId);
    if (options?.folderId) params.append("folderId", options.folderId);
    
    const query = params.toString();
    return this.request(`/channels/${channelId}/email/messages/${messageId}/attachments${query ? `?${query}` : ""}`);
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
    data: string; // base64 encoded
    contentType: string;
    filename: string;
  }> {
    const params = new URLSearchParams();
    if (options?.accountId) params.append("accountId", options.accountId);
    if (options?.folderId) params.append("folderId", options.folderId);
    
    const query = params.toString();
    return this.request(`/channels/${channelId}/email/messages/${messageId}/attachments/${attachmentId}${query ? `?${query}` : ""}`);
  }

  async triggerEmailSync(channelId: string): Promise<{
    success: boolean;
    message: string;
    status: ChannelRuntimeStatus;
  }> {
    return this.request(`/channels/${channelId}/email/sync`, {
      method: "POST",
    });
  }

  async markEmailsAsRead(
    channelId: string,
    messageIds: string[]
  ): Promise<{
    success: boolean;
    messageIds: string[];
  }> {
    return this.request(`/channels/${channelId}/email/mark-read`, {
      method: "POST",
      body: { messageIds },
    });
  }
}

// Singleton instance
let apiClientInstance: VeraCoworkApiClient | null = null;

export function getVeraCoworkApiClient(): VeraCoworkApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new VeraCoworkApiClient();
  }
  return apiClientInstance;
}

export function setVeraCoworkApiUrl(url: string): void {
  apiClientInstance = new VeraCoworkApiClient(url);
}

// ============================================
// Processed Email IDs (Server-side storage)
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

export async function getEmailConfigFromServer(): Promise<AutoSyncEmailConfig> {
  const api = getVeraCoworkApiClient();
  const response = await api.request<{ channelId?: string | null; enabled?: boolean; agentIds?: string[]; routingRules?: Array<{ fromPattern: string; agentId: string }>; sinceDate?: string; processingMode?: 'unread_only' | 'today_all'; markAsReadAfterProcess?: boolean }>('/channels/email/config');
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

export async function updateEmailConfigOnServer(config: Partial<AutoSyncEmailConfig>): Promise<AutoSyncEmailConfig> {
  const api = getVeraCoworkApiClient();
  const response = await api.request<{ channelId?: string | null; enabled?: boolean; agentIds?: string[]; routingRules?: Array<{ fromPattern: string; agentId: string }>; sinceDate?: string; processingMode?: 'unread_only' | 'today_all'; markAsReadAfterProcess?: boolean }>('/channels/email/config', {
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

export async function getProcessedEmailIdsFromServer(accountId: string, folderId: string): Promise<string[]> {
  const api = getVeraCoworkApiClient();
  const response = await api.request<{ ids?: string[] }>(`/channels/email/processed-ids/${accountId}/${folderId}`);
  return response?.ids || [];
}

export interface ProcessedEmailRecord {
  id: string;
  messageId: string;
  conversationId: string | null;
  agentId: string | null;
  processedAt: string;
}

export async function getProcessedEmailDetailsFromServer(accountId: string, folderId: string): Promise<ProcessedEmailRecord[]> {
  const api = getVeraCoworkApiClient();
  const response = await api.request<{ records?: ProcessedEmailRecord[] }>(`/channels/email/processed-ids/${accountId}/${folderId}?includeDetails=true`);
  return response?.records || [];
}

export async function setProcessedEmailIdsToServer(accountId: string, folderId: string, ids: string[], conversationId?: string, agentId?: string): Promise<void> {
  const api = getVeraCoworkApiClient();
  await api.request<void>(`/channels/email/processed-ids/${accountId}/${folderId}`, {
    method: 'PUT',
    body: { ids, conversationId, agentId },
  });
}

export async function markEmailAsProcessedOnServer(
  accountId: string, 
  folderId: string, 
  messageId: string, 
  conversationId?: string, 
  agentId?: string
): Promise<{ success: boolean; id?: string }> {
  const api = getVeraCoworkApiClient();
  return api.request<{ success: boolean; id?: string }>(`/channels/email/processed-ids/${accountId}/${folderId}/${messageId}`, {
    method: 'POST',
    body: { conversationId, agentId },
  });
}

export async function clearProcessedEmailIdsOnServer(accountId: string, folderId: string): Promise<void> {
  const api = getVeraCoworkApiClient();
  await api.request<void>(`/channels/email/processed-ids/${accountId}/${folderId}`, {
    method: 'DELETE',
  });
}

// ============================================
// Email Token Storage (Server-side)
// ============================================

export interface EmailTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: number;
  accountId?: string;
  folderId?: string;
  email?: string;
}

export async function storeEmailTokensOnServer(tokens: EmailTokens): Promise<{ success: boolean; channelId?: string }> {
  const api = getVeraCoworkApiClient();
  return api.request<{ success: boolean; channelId?: string }>('/channels/email/tokens', {
    method: 'PUT',
    body: tokens,
  });
}

export async function getEmailTokenMetadataFromServer(): Promise<{ hasCredentials: boolean }> {
  const api = getVeraCoworkApiClient();
  return api.request<{ hasCredentials: boolean }>('/channels/email/tokens');
}

export async function deleteEmailTokensOnServer(): Promise<{ success: boolean }> {
  const api = getVeraCoworkApiClient();
  return api.request<{ success: boolean }>('/channels/email/tokens', {
    method: 'DELETE',
  });
}
