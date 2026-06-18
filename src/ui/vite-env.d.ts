/// <reference types="vite/client" />

// Feature flag globals from Vite environment
declare const SHOW_CHANNELS: boolean | undefined;
declare const SHOW_EMAIL_OPTION: boolean | undefined;

// Window electron API types
interface Window {
  electron: {
    // Statistics
    subscribeStatistics: (callback: (statistics: any) => void) => () => void;
    getStaticData: () => Promise<any>;

    // Client events
    sendClientEvent: (event: any) => void;
    onServerEvent: (callback: (event: any) => void) => () => void;
    onAuthExpired: (callback: () => void) => () => void;

    // Directory
    getRecentCwds: (limit?: number) => Promise<string[]>;
    selectDirectory: () => Promise<string | null>;

    // External
    openExternal: (url: string) => Promise<void>;

    // Email
    fetchEmails: (accountId: string, params?: any) => Promise<any>;
    fetchFolders: () => Promise<any>;
    fetchAccounts: () => Promise<any>;
    
    // Email Channel Configuration (Server-Side)
    setEmailChannelId: (channelId: string | null) => Promise<{ success: boolean }>;
    getEmailChannelId: () => Promise<string | null>;
    triggerEmailSync: () => Promise<{ success: boolean }>;
    
    onEmailConnected: (callback: (data: { success: boolean }) => void) => () => void;
    connectEmail: () => Promise<any>;
    disconnectEmail: () => Promise<any>;
    checkAlreadyConnected: () => Promise<any>;
    fetchEmailById: (accountId: string, folderId: string, messageId: string) => Promise<any>;
    fetchEmailDetails: (accountId: string, folderId: string, messageId: string) => Promise<any>;
    uploadEmailAttachmentToAgent: (folderId: string, messageId: string, accountId: string, agentId: string) => Promise<any>;
    downloadEmailAttachment: (folderId: string, messageId: string, accountId: string) => Promise<any>;
    markMessagesAsRead: (accountId: string, messageIds: (number | string)[]) => Promise<any>;
    searchEmails: (accountId: string, params: any) => Promise<any>;

    // Letta
    getLettaEnv: () => Promise<any>;
    listLettaAgents: () => Promise<any>;
    /** Clone an existing agent as letta_v1_agent for runtime client_tools support. */
    lettaMigrateAgent: (opts: { sourceAgentId: string; newName?: string; baseTools?: string[] }) => Promise<
      | { ok: true; data: { sourceAgentId: string; newAgentId: string; newAgentName: string; blocksCopied: number; skippedBlocks: Array<{ label: string; reason: string }> } }
      | { ok: false; error: string }
    >;
    listLettaModels: () => Promise<any>;
    getLettaAgent: (agentId: string) => Promise<any>;
    recoverPendingApprovals: (sessionId: string, agentId?: string) => Promise<any[]>;
    cancelStuckRun: (runId: string) => Promise<any>;
    getRunStatus: (runId: string) => Promise<any>;
    runLettaCli: (args: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    startLettaCliStream: (args: string[]) => Promise<{ processId: string }>;
    onLettaCliOutput: (callback: (payload: { type: string; data: string; processId: string }) => void) => () => void;
    killLettaCli: (processId: string) => Promise<void>;
    registerLettaCodeTools: (enabled: boolean) => Promise<{ registered: string[]; skipped: string[] }>;
    attachLettaCodeToolsToAgent: (agentId: string) => Promise<{ attached: string[]; failed: string[] }>;
    listAgentMemoryFiles: () => Promise<any>;
    updateLettaEnv: (values: any) => Promise<any>;
    isAdmin: () => Promise<boolean>;

    // Channel Bridges (Legacy)
    getChannelBridgesConfig: () => Promise<any>;
    updateChannelBridgesConfig: (values: any) => Promise<any>;
    getWhatsAppBridgeStatus: () => Promise<any>;
    startWhatsAppBridge: () => Promise<any>;
    stopWhatsAppBridge: () => Promise<any>;
    getTelegramBridgeStatus: () => Promise<any>;
    startTelegramBridge: () => Promise<any>;
    stopTelegramBridge: () => Promise<any>;
    getDiscordBridgeStatus: () => Promise<any>;
    startDiscordBridge: () => Promise<any>;
    stopDiscordBridge: () => Promise<any>;
    getSlackBridgeStatus: () => Promise<any>;
    startSlackBridge: () => Promise<any>;
    stopSlackBridge: () => Promise<any>;

    // Skills
    downloadSkill: (handles: string | string[], skillName?: string, branch?: string) => Promise<any>;

    // Cowork Settings
    getCoworkSettings: () => Promise<any>;
    updateCoworkSettings: (updates: any) => Promise<any>;
    resetCoworkSettings: () => Promise<any>;
    getAutoSyncUnreadConfig: () => Promise<any>;
    updateAutoSyncUnreadConfig: (updates: any) => Promise<any>;
    resetAutoSyncUnreadConfig: () => Promise<any>;
    getRemoteAccessState: () => Promise<any>;
    updateRemoteAccessSettings: (updates: any) => Promise<any>;
    resetRemoteAccessSettings: () => Promise<any>;
    onRemoteAccessState: (callback: (state: any) => void) => (() => void);
    getProcessedUnreadEmailIds: (accountId: string, folderId: string) => Promise<string[]>;
    setProcessedUnreadEmailIds: (accountId: string, folderId: string, ids: string[]) => Promise<string[]>;
    clearProcessedUnreadEmailIds: (accountId: string, folderId: string) => Promise<void>;
    updateEmailConversationId: (accountId: string, folderId: string, messageId: string, conversationId: string, agentId?: string) => Promise<void>;
    getProcessedUnreadEmailDebugInfo: (accountId: string, folderId: string, limit?: number) => Promise<any>;
    getProcessedEmailDetailsFromServer: (accountId: string, folderId: string) => Promise<Array<{
      id: string;
      messageId: string;
      conversationId: string | null;
      agentId: string | null;
      processedAt: string;
    }>>;

    // ============================================
    // Vera Cowork API Integration
    // ============================================

    // API Configuration
    apiSetUrl: (url: string) => Promise<{ success: boolean; url: string }>;
    apiGetUrl: () => Promise<string>;

    // Authentication
    apiIsAuthenticated: () => Promise<boolean>;
    apiGetCurrentUser: () => Promise<{
      id: string;
      email: string;
      firstName?: string;
      lastName?: string | null;
      phoneNumber?: string | null;
      organizationId: string;
      role: string;
    } | null>;
    apiUpdateCurrentUserProfile: (data: {
      firstName?: string;
      lastName?: string | null;
    }) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiRequestMobileOtp: (phoneNumber: string) => Promise<{
      success: boolean;
      message?: string;
      expiresInMinutes?: number;
      phoneNumber?: string;
      error?: string;
    }>;
    apiVerifyMobileOtp: (phoneNumber: string, otp: string) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiLogin: (email: string, password: string) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiRequestEmailOtp: (email: string) => Promise<{
      success: boolean;
      message?: string;
      expiresInMinutes?: number;
      error?: string;
    }>;
    apiVerifyEmailOtp: (email: string, otp: string) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiRegister: (data: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      phoneNumber?: string;
      organizationId?: string;
    }) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiListWorkspaces: () => Promise<{
      success: boolean;
      workspaces?: Array<{ id: string; name: string }>;
      error?: string;
    }>;
    apiLogout: () => Promise<void>;

    // Connectors
    apiListConnectorProviders: () => Promise<{
      success: boolean;
      providers?: any[];
      error?: string;
    }>;
    apiListConnectorMarketplace: () => Promise<{
      success: boolean;
      plugins?: any[];
      error?: string;
    }>;
    apiListConnectorPlugins: () => Promise<{
      success: boolean;
      providers?: any[];
      plugins?: any[];
      error?: string;
    }>;
    apiInstallConnectorPlugin: (data: {
      pluginId: string;
      version?: string;
      source?: any;
    }) => Promise<{
      success: boolean;
      result?: any;
      error?: string;
    }>;

    // Channels
    apiListChannels: () => Promise<{
      success: boolean;
      channels?: any[];
      error?: string;
    }>;
    apiListOrganizationChannels: () => Promise<{
      success: boolean;
      channels?: any[];
      error?: string;
    }>;
    apiListOrganizationUsers: () => Promise<{
      success: boolean;
      users?: any[];
      error?: string;
    }>;
    apiListAgentSecrets: () => Promise<{
      success: boolean;
      secrets?: Array<{ id: string; name: string; keyVersion?: string; createdAt?: string; updatedAt?: string }>;
      error?: string;
    }>;
    apiUpsertAgentSecret: (data: { name: string; value: string }) => Promise<{
      success: boolean;
      secret?: { id: string; name: string; keyVersion?: string; createdAt?: string; updatedAt?: string };
      error?: string;
    }>;
    apiDeleteAgentSecret: (id: string) => Promise<{
      success: boolean;
      error?: string;
    }>;
    apiCreateChannel: (data: {
      provider: string;
      name: string;
      externalId?: string;
      config?: any;
    }) => Promise<{
      success: boolean;
      channel?: any;
      error?: string;
    }>;
    apiGetChannel: (channelId: string) => Promise<{
      success: boolean;
      channel?: any;
      error?: string;
    }>;
    apiDeleteChannel: (channelId: string) => Promise<{
      success: boolean;
      error?: string;
    }>;

    // Channel Credentials
    apiGetChannelCredentials: (channelId: string) => Promise<{
      success: boolean;
      hasCredentials?: boolean;
      keyVersion?: string;
      updatedAt?: Date;
      error?: string;
    }>;
    apiSetChannelCredentials: (channelId: string, data: {
      credentials: Record<string, string>;
      secureConfig?: any;
    }) => Promise<{
      success: boolean;
      channel?: any;
      credentials?: any;
      error?: string;
    }>;
    apiDeleteChannelCredentials: (channelId: string) => Promise<{
      success: boolean;
      error?: string;
    }>;

    // Channel Runtime
    apiStartChannel: (channelId: string) => Promise<{
      success: boolean;
      status?: any;
      error?: string;
    }>;
    apiStopChannel: (channelId: string) => Promise<{
      success: boolean;
      status?: any;
      error?: string;
    }>;
    apiGetChannelStatus: (channelId: string) => Promise<{
      success: boolean;
      status?: any;
      error?: string;
    }>;
    apiGetAllRuntimeStatus: () => Promise<{
      success: boolean;
      channels?: any[];
      count?: number;
      error?: string;
    }>;
    apiGetWeChatIlinkQrCode: (options?: { baseUrl?: string }) => Promise<{
      success: boolean;
      qrcode?: string;
      qrcodeImageUrl?: string | null;
      qrcodeImageContent?: string | null;
      baseUrl?: string;
      error?: string;
    }>;
    apiGetWeChatIlinkQrCodeStatus: (qrcode: string, options?: { baseUrl?: string }) => Promise<{
      success: boolean;
      status?: string;
      accountId?: string | null;
      botToken?: string | null;
      userId?: string | null;
      baseUrl?: string;
      error?: string;
    }>;

    // Messages
    apiGetMessageLogs: (channelId: string, options?: {
      direction?: string;
      limit?: number;
      offset?: number;
    }) => Promise<{
      success: boolean;
      messages?: any[];
      total?: number;
      error?: string;
    }>;
    apiSendMessage: (channelId: string, to: string, content: string) => Promise<{
      success: boolean;
      id?: string;
      externalMessageId?: string;
      status?: string;
      createdAt?: Date;
      error?: string;
    }>;

    // Conversation Context
    apiGetConversationContext: (channelId: string, options?: {
      limit?: number;
      since?: string;
    }) => Promise<{
      success: boolean;
      context?: any;
      error?: string;
    }>;
    apiGetGroupConversationContext: (channelId: string, groupId: string, options?: {
      limit?: number;
      since?: string;
    }) => Promise<{
      success: boolean;
      context?: any;
      error?: string;
    }>;

    // Scheduler
    schedulerList: () => Promise<any[]>;
    schedulerCreate: (dto: Record<string, unknown>) => Promise<any>;
    schedulerUpdate: (id: string, dto: Record<string, unknown>) => Promise<any>;
    schedulerToggle: (id: string) => Promise<any>;
    schedulerDelete: (id: string) => Promise<{ success: boolean }>;
    schedulerRunNow: (id: string) => Promise<{ status: string; startedAt: string; completedAt?: string; error?: string | null; output?: string | null }>;
    schedulerRuns: (id: string, limit?: number, offset?: number) => Promise<{ runs: any[]; total: number }>;

    // Runs Debugger
    listAgentRuns: (params: {
      agentId: string;
      conversationId?: string;
      status?: "all" | "requires_approval" | "running" | "completed" | "failed" | "cancelled";
      limit?: number;
      offset?: number;
    }) => Promise<{
      runs: Array<{
        id: string;
        agentId?: string;
        conversationId?: string;
        status?: "created" | "running" | "completed" | "failed" | "cancelled" | "requires_approval";
        stopReason?: string | null;
        createdAt?: string;
        completedAt?: string | null;
        durationMs?: number;
        pendingApprovals?: Array<{ toolUseId: string; toolName: string; input: unknown }>;
        raw?: unknown;
      }>;
      total: number;
    }>;
    approveAgentRun: (runId: string) => Promise<{ success: boolean; runId: string; method?: string }>;
    rejectAgentRun: (runId: string) => Promise<{ success: boolean; runId: string }>;
    approveAllAgentRuns: (agentId: string, conversationId?: string) => Promise<{
      approved: string[];
      failed: Array<{ runId: string; error: string }>;
    }>;
    rejectAllAgentRuns: (agentId: string, conversationId?: string) => Promise<{
      cancelled: string[];
      failed: Array<{ runId: string; error: string }>;
    }>;
  };
}
