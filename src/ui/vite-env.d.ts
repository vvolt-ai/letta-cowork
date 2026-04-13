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
      organizationId: string;
      role: string;
    } | null>;
    apiLogin: (email: string, password: string) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiRegister: (data: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
    }) => Promise<{
      success: boolean;
      user?: any;
      error?: string;
    }>;
    apiLogout: () => Promise<void>;

    // Channels
    apiListChannels: () => Promise<{
      success: boolean;
      channels?: any[];
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
    schedulerRuns: (id: string, limit?: number, offset?: number) => Promise<{ runs: any[]; total: number }>;
  };
}
