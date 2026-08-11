/**
 * Vera Cowork API Client
 * 
 * Main API client that combines base HTTP functionality with
 * all endpoint modules for a unified interface.
 */

import { BaseHttpClient } from "./base-client.js";
import { ChannelEndpoints } from "../endpoints/channels.js";
import { ConnectorEndpoints } from "../endpoints/connectors.js";
import { EmailEndpoints } from "../endpoints/emails.js";
import { McpEndpoints } from "../endpoints/mcp.js";
import { SchedulerEndpoints } from "../endpoints/scheduler.js";

import type { InstallConnectorPluginInput } from "../endpoints/connectors.js";
import type {
  McpServer,
  McpServerWithTools,
  McpTool,
  McpAttachment,
  CreateMcpServerInput,
  UpdateMcpServerInput,
  McpToolRunResult,
} from "../endpoints/mcp.js";
import type { 
  AuthTokens, 
  Channel, 
  ChannelRuntimeStatus, 
  ChannelCredentials,
  MessageLog,
  ConversationContext,
  WeChatIlinkQrCodeResponse,
  WeChatIlinkQrStatusResponse,
  OrganizationUser,
  AgentSecret,
  UpsertAgentSecretInput,
  AdminOverview,
  AdminUser,
  AdminOrganization,
  AdminMembership,
  AdminChannel,
  AdminChannelShare,
  AdminChannelInput,
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

  async requestEmailOtp(email: string): Promise<{ success: boolean; message: string; expiresInMinutes: number }> {
    const response = await fetch(`${this.baseUrl}/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OTP request failed: ${error}`);
    }

    return response.json();
  }

  async verifyEmailOtp(email: string, otp: string): Promise<AuthTokens> {
    const response = await fetch(`${this.baseUrl}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OTP verification failed: ${error}`);
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

  async listWorkspaces(): Promise<Array<{ id: string; name: string }>> {
    const response = await fetch(`${this.baseUrl}/auth/workspaces`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to load workspaces: ${error}`);
    }

    return response.json();
  }

  async register(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    organizationId?: string;
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

  /**
   * Fetch the current authenticated user from the server. Throws if the session
   * is invalid. On success, persists the user info into the token cache.
   */
  async fetchCurrentUser(): Promise<AuthTokens["user"]> {
    const user = await this.request<AuthTokens["user"]>("/auth/me", {
      suppressAuthExpired: false,
    });

    if (this.tokens) {
      this.tokens = { ...this.tokens, user };
      this.saveTokens();
    }

    return user;
  }

  async requestMobileOtp(phoneNumber: string): Promise<{ success: boolean; message: string; expiresInMinutes: number; phoneNumber: string }> {
    return this.request<{ success: boolean; message: string; expiresInMinutes: number; phoneNumber: string }>("/auth/mobile-otp/request", {
      method: "POST",
      body: { phoneNumber },
      suppressAuthExpired: false,
    });
  }

  async verifyMobileOtp(phoneNumber: string, otp: string): Promise<AuthTokens["user"]> {
    const user = await this.request<AuthTokens["user"]>("/auth/mobile-otp/verify", {
      method: "POST",
      body: { phoneNumber, otp },
      suppressAuthExpired: false,
    });

    if (this.tokens) {
      this.tokens = { ...this.tokens, user };
      this.saveTokens();
    }

    return user;
  }

  async updateCurrentUserProfile(data: {
    firstName?: string;
    lastName?: string | null;
  }): Promise<AuthTokens["user"]> {
    const user = await this.request<AuthTokens["user"]>("/auth/me", {
      method: "PATCH",
      body: data,
      suppressAuthExpired: false,
    });

    if (this.tokens) {
      this.tokens = { ...this.tokens, user };
      this.saveTokens();
    }

    return user;
  }

  /**
   * Verify with the server that the stored tokens are still valid.
   * Returns true if authenticated, false otherwise.
   */
  async verifyAuth(): Promise<boolean> {
    if (!this.tokens?.accessToken) {
      return false;
    }

    try {
      await this.fetchCurrentUser();
      return true;
    } catch (error) {
      return false;
    }
  }

  // ============================================
  // Connectors - provider/plugin metadata
  // ============================================

  async listConnectorProviders() {
    return ConnectorEndpoints.listConnectorProviders(this);
  }

  async listConnectorMarketplace() {
    return ConnectorEndpoints.listConnectorMarketplace(this);
  }

  async listConnectorPlugins() {
    return ConnectorEndpoints.listConnectorPlugins(this);
  }

  async installConnectorPlugin(input: InstallConnectorPluginInput) {
    return ConnectorEndpoints.installConnectorPlugin(this, input);
  }

  // ============================================
  // Channels - Delegate to ChannelEndpoints
  // ============================================

  async getEmailOAuthConnectUrl(): Promise<{
    auth_url: string;
    state: string;
    channelId: string;
    scopes: readonly string[];
  }> {
    return ChannelEndpoints.getEmailOAuthConnectUrl(this);
  }

  async listChannels(): Promise<Channel[]> {
    return ChannelEndpoints.listChannels(this);
  }

  async listOrganizationChannels(): Promise<Channel[]> {
    return ChannelEndpoints.listOrganizationChannels(this);
  }

  async listOrganizationUsers(): Promise<OrganizationUser[]> {
    return this.request<OrganizationUser[]>("/users/organization");
  }

  async listAgentSecrets(): Promise<AgentSecret[]> {
    return this.request<AgentSecret[]>("/agent-secrets");
  }

  async upsertAgentSecret(input: UpsertAgentSecretInput): Promise<AgentSecret> {
    return this.request<AgentSecret>("/agent-secrets", {
      method: "POST",
      body: input,
    });
  }

  async getAgentSecretRuntimeEnv(agentId: string): Promise<Record<string, string>> {
    const result = await this.request<{ env: Record<string, string> }>(
      "/agent-secrets/runtime-env",
      {
        method: "POST",
        body: { agentId },
      },
    );
    return result.env ?? {};
  }

  async deleteAgentSecret(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/agent-secrets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  // ============================================
  // Super-admin - global management surface
  // ============================================

  async adminOverview(): Promise<AdminOverview> {
    return this.request<AdminOverview>("/admin/overview", { suppressAuthExpired: false });
  }

  async adminListUsers(): Promise<AdminUser[]> {
    return this.request<AdminUser[]>("/admin/users", { suppressAuthExpired: false });
  }

  async adminUpdateUser(userId: string, input: Partial<AdminUser>): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminListOrganizations(): Promise<AdminOrganization[]> {
    return this.request<AdminOrganization[]>("/admin/organizations", { suppressAuthExpired: false });
  }

  async adminCreateOrganization(input: { name: string; isActive?: boolean }): Promise<AdminOrganization> {
    return this.request<AdminOrganization>("/admin/organizations", {
      method: "POST",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminUpdateOrganization(organizationId: string, input: Partial<AdminOrganization>): Promise<AdminOrganization> {
    return this.request<AdminOrganization>(`/admin/organizations/${encodeURIComponent(organizationId)}`, {
      method: "PATCH",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminListMemberships(): Promise<AdminMembership[]> {
    return this.request<AdminMembership[]>("/admin/memberships", { suppressAuthExpired: false });
  }

  async adminUpsertMembership(input: { userId: string; organizationId: string; role?: string; isActive?: boolean }): Promise<AdminMembership> {
    return this.request<AdminMembership>("/admin/memberships", {
      method: "POST",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminUpdateMembership(membershipId: string, input: Partial<AdminMembership>): Promise<AdminMembership> {
    return this.request<AdminMembership>(`/admin/memberships/${encodeURIComponent(membershipId)}`, {
      method: "PATCH",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminListChannels(): Promise<AdminChannel[]> {
    return this.request<AdminChannel[]>("/admin/channels", { suppressAuthExpired: false });
  }

  async adminCreateChannel(input: AdminChannelInput): Promise<AdminChannel> {
    return this.request<AdminChannel>("/admin/channels", {
      method: "POST",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminUpdateChannel(channelId: string, input: Partial<AdminChannelInput>): Promise<AdminChannel> {
    return this.request<AdminChannel>(`/admin/channels/${encodeURIComponent(channelId)}`, {
      method: "PATCH",
      body: input,
      suppressAuthExpired: false,
    });
  }

  async adminDeleteChannel(channelId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/admin/channels/${encodeURIComponent(channelId)}`, {
      method: "DELETE",
      suppressAuthExpired: false,
    });
  }

  async adminListChannelShares(): Promise<AdminChannelShare[]> {
    return this.request<AdminChannelShare[]>("/admin/channel-shares", { suppressAuthExpired: false });
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

  async getWeChatIlinkQrCode(options?: { baseUrl?: string }): Promise<WeChatIlinkQrCodeResponse> {
    return ChannelEndpoints.getWeChatIlinkQrCode(this, options);
  }

  async getWeChatIlinkQrCodeStatus(
    qrcode: string,
    options?: { baseUrl?: string }
  ): Promise<WeChatIlinkQrStatusResponse> {
    return ChannelEndpoints.getWeChatIlinkQrCodeStatus(this, qrcode, options);
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

  // ============================================
  // Scheduler - Delegate to SchedulerEndpoints
  // ============================================

  get scheduler(): SchedulerEndpoints {
    return new SchedulerEndpoints(this);
  }

  // ============================================
  // MCP - Delegate to McpEndpoints
  // ============================================
  // Thin pass-throughs so callers can use `api.mcpListServers()`
  // alongside `api.listChannels()` without having to import the
  // endpoint class directly. Same convention as channels above.

  async mcpListServers(): Promise<McpServer[]> {
    return McpEndpoints.listServers(this);
  }

  async mcpGetServer(id: string): Promise<McpServerWithTools> {
    return McpEndpoints.getServer(this, id);
  }

  async mcpCreateServer(data: CreateMcpServerInput): Promise<McpServer> {
    return McpEndpoints.createServer(this, data);
  }

  async mcpUpdateServer(
    id: string,
    data: UpdateMcpServerInput,
  ): Promise<McpServer> {
    return McpEndpoints.updateServer(this, id, data);
  }

  async mcpDeleteServer(id: string): Promise<void> {
    return McpEndpoints.deleteServer(this, id);
  }

  async mcpRefreshTools(id: string): Promise<McpTool[]> {
    return McpEndpoints.refreshTools(this, id);
  }

  async mcpTestServer(
    id: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return McpEndpoints.testServer(this, id);
  }

  async mcpFetchVisibleTools(input: {
    serverSlug?: string;
    query?: string;
    limit?: number;
  }): Promise<McpToolRunResult> {
    return McpEndpoints.fetchVisibleTools(this, input);
  }

  async mcpInvokeVisibleTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolRunResult> {
    return McpEndpoints.invokeVisibleTool(this, toolName, args);
  }

  async mcpListAttachments(agentId: string): Promise<McpAttachment[]> {
    return McpEndpoints.listAttachments(this, agentId);
  }

  async mcpAttach(
    agentId: string,
    mcpServerId: string,
    toolNames: string[] | null,
  ): Promise<McpAttachment> {
    return McpEndpoints.attach(this, agentId, mcpServerId, toolNames);
  }

  async mcpUpdateAttachment(
    agentId: string,
    mcpServerId: string,
    toolNames: string[] | null,
  ): Promise<McpAttachment> {
    return McpEndpoints.updateAttachment(this, agentId, mcpServerId, toolNames);
  }

  async mcpDetach(agentId: string, mcpServerId: string): Promise<void> {
    return McpEndpoints.detach(this, agentId, mcpServerId);
  }

  async mcpListToolsForAgent(
    agentId: string,
  ): Promise<
    Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  > {
    return McpEndpoints.listToolsForAgent(this, agentId);
  }

  async mcpListEnvKeysForAgent(agentId: string): Promise<{ agentId: string; keys: string[] }> {
    return McpEndpoints.listEnvKeysForAgent(this, agentId);
  }

  async mcpRunToolForAgent(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolRunResult> {
    return McpEndpoints.runToolForAgent(this, agentId, toolName, args);
  }
}
