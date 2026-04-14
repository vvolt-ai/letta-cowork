import electron from "electron";

electron.contextBridge.exposeInMainWorld("electron", {
    subscribeStatistics: (callback: (stats: any) => void) =>
        ipcOn("statistics", stats => {
            callback(stats);
        }),
    getStaticData: () => ipcInvoke("getStaticData"),

    // Letta Agent IPC APIs
    sendClientEvent: (event: any) => {
        electron.ipcRenderer.send("client-event", event);
    },
    onServerEvent: (callback: (event: any) => void) => {
        const cb = (_: Electron.IpcRendererEvent, payload: string) => {
            try {
                const event = JSON.parse(payload);
                callback(event);
            } catch (error) {
                console.error("Failed to parse server event:", error);
            }
        };
        electron.ipcRenderer.on("server-event", cb);
        return () => electron.ipcRenderer.off("server-event", cb);
    },
    onAuthExpired: (callback: () => void) => {
        electron.ipcRenderer.on("auth-expired", callback);
        return () => electron.ipcRenderer.off("auth-expired", callback);
    },

    getRecentCwds: (limit?: number) =>
        ipcInvoke("get-recent-cwds", limit),
    selectDirectory: () =>
        ipcInvoke("select-directory"),

    // ✅ ADD THIS
    openExternal: (url: string) => electron.ipcRenderer.invoke("open-external", url),
    
    // Email Channel Configuration (Server-Side)
    setEmailChannelId: (channelId: string | null) =>
        electron.ipcRenderer.invoke("set-email-channel-id", channelId),
    getEmailChannelId: () =>
        electron.ipcRenderer.invoke("get-email-channel-id"),
    triggerEmailSync: () =>
        electron.ipcRenderer.invoke("trigger-email-sync"),
    
    // Email Operations
    fetchEmails: (accountId: string, params?: EmailListParams) =>
        electron.ipcRenderer.invoke("fetch-emails", accountId, params),
    fetchFolders: () =>
        electron.ipcRenderer.invoke("fetch-folders"),
    fetchAccounts: () =>
        electron.ipcRenderer.invoke("fetch-accounts"),
    onEmailConnected: (callback: (data: { success: boolean }) => void) => {
        const cb = (_: any, payload: { success: boolean }) => callback(payload);
        electron.ipcRenderer.on("email-connected", cb);
        return () => electron.ipcRenderer.off("email-connected", cb);
    },
    connectEmail: () =>
        electron.ipcRenderer.invoke("connect-email"),
    disconnectEmail: () =>
        electron.ipcRenderer.invoke("disconnect-email"),
    checkAlreadyConnected: () =>
        electron.ipcRenderer.invoke("is-email-already-connected"),
    fetchEmailById: (accountId: string, folderId: string, messageId: string) =>
        electron.ipcRenderer.invoke("fetch-email-by-id", accountId, folderId, messageId),
    fetchEmailDetails: (accountId: string, folderId: string, messageId: string) =>
        electron.ipcRenderer.invoke("fetch-email-details", accountId, folderId, messageId),
    uploadEmailAttachmentToAgent: (folderId: string, messageId: string, accountId: string, agentId: string) =>
        electron.ipcRenderer.invoke("upload-email-attachment-to-agent", folderId, messageId, accountId, agentId),
    downloadEmailAttachment: (folderId: string, messageId: string, accountId: string) =>
        electron.ipcRenderer.invoke("download-email-attachment", folderId, messageId, accountId),
    markMessagesAsRead: (accountId: string, messageIds: (number | string)[]) =>
        electron.ipcRenderer.invoke("update-messages", accountId, { mode: "markAsRead", messageId: messageIds }),
    searchEmails: (accountId: string, params: any) =>
        electron.ipcRenderer.invoke("search-emails", accountId, params),
    getLettaEnv: () =>
        electron.ipcRenderer.invoke("get-letta-env"),
    listLettaAgents: () =>
        electron.ipcRenderer.invoke("list-letta-agents"),
    listLettaModels: () =>
        electron.ipcRenderer.invoke("list-letta-models"),
    getLettaAgent: (agentId: string) =>
        electron.ipcRenderer.invoke("get-letta-agent", agentId),
    recoverPendingApprovals: (sessionId: string, agentId?: string) =>
        electron.ipcRenderer.invoke("recover-pending-approvals", sessionId, agentId),
    cancelStuckRun: (runId: string) =>
        electron.ipcRenderer.invoke("cancel-stuck-run", runId),
    getRunStatus: (runId: string) =>
        electron.ipcRenderer.invoke("get-run-status", runId),
    listAgentMemoryFiles: () =>
        electron.ipcRenderer.invoke("list-agent-memory-files"),
    updateLettaEnv: (values: { LETTA_API_KEY: string; LETTA_BASE_URL: string; LETTA_AGENT_ID: string }) =>
        electron.ipcRenderer.invoke("update-letta-env", values),
    isAdmin: () =>
        electron.ipcRenderer.invoke("is-admin"),
    getChannelBridgesConfig: () =>
        electron.ipcRenderer.invoke("get-channel-bridges-config"),
    updateChannelBridgesConfig: (values: any) =>
        electron.ipcRenderer.invoke("update-channel-bridges-config", values),
    getWhatsAppBridgeStatus: () =>
        electron.ipcRenderer.invoke("get-whatsapp-bridge-status"),
    startWhatsAppBridge: () =>
        electron.ipcRenderer.invoke("start-whatsapp-bridge"),
    stopWhatsAppBridge: () =>
        electron.ipcRenderer.invoke("stop-whatsapp-bridge"),
    getTelegramBridgeStatus: () =>
        electron.ipcRenderer.invoke("get-telegram-bridge-status"),
    startTelegramBridge: () =>
        electron.ipcRenderer.invoke("start-telegram-bridge"),
    stopTelegramBridge: () =>
        electron.ipcRenderer.invoke("stop-telegram-bridge"),
    getDiscordBridgeStatus: () =>
        electron.ipcRenderer.invoke("get-discord-bridge-status"),
    startDiscordBridge: () =>
        electron.ipcRenderer.invoke("start-discord-bridge"),
    stopDiscordBridge: () =>
        electron.ipcRenderer.invoke("stop-discord-bridge"),
    getSlackBridgeStatus: () =>
        electron.ipcRenderer.invoke("get-slack-bridge-status"),
    startSlackBridge: () =>
        electron.ipcRenderer.invoke("start-slack-bridge"),
    stopSlackBridge: () =>
        electron.ipcRenderer.invoke("stop-slack-bridge"),
    downloadSkill: (handles: string | string[], skillName?: string, branch?: string) =>
        electron.ipcRenderer.invoke("download-skill", handles, skillName, branch),
    listSkills: () =>
        electron.ipcRenderer.invoke("list-skills"),
    
    // Cowork settings
    getCoworkSettings: () =>
        electron.ipcRenderer.invoke("get-cowork-settings"),
    updateCoworkSettings: (updates: any) =>
        electron.ipcRenderer.invoke("update-cowork-settings", updates),
    resetCoworkSettings: () =>
        electron.ipcRenderer.invoke("reset-cowork-settings"),
    getAutoSyncUnreadConfig: () =>
        electron.ipcRenderer.invoke("get-auto-sync-unread-config"),
    updateAutoSyncUnreadConfig: (updates: any) =>
        electron.ipcRenderer.invoke("update-auto-sync-unread-config", updates),
    resetAutoSyncUnreadConfig: () =>
        electron.ipcRenderer.invoke("reset-auto-sync-unread-config"),
    getProcessedUnreadEmailIds: (accountId: string, folderId: string) =>
        electron.ipcRenderer.invoke("get-processed-unread-email-ids", accountId, folderId),
    setProcessedUnreadEmailIds: (accountId: string, folderId: string, ids: string[]) =>
        electron.ipcRenderer.invoke("set-processed-unread-email-ids", accountId, folderId, ids),
    clearProcessedUnreadEmailIds: (accountId: string, folderId: string) =>
        electron.ipcRenderer.invoke("clear-processed-unread-email-ids", accountId, folderId),
    updateEmailConversationId: (accountId: string, folderId: string, messageId: string, conversationId: string, agentId?: string) =>
        electron.ipcRenderer.invoke("update-email-conversation-id", accountId, folderId, messageId, conversationId, agentId),
    getProcessedUnreadEmailDebugInfo: (accountId: string, folderId: string, limit?: number) =>
        electron.ipcRenderer.invoke("get-processed-unread-email-debug-info", accountId, folderId, limit),
    getProcessedEmailDetailsFromServer: (accountId: string, folderId: string) =>
        electron.ipcRenderer.invoke("get-processed-email-details-from-server", accountId, folderId),

    // ============================================
    // Letta CLI Execution
    // ============================================

    /** Run a letta CLI command and return full output when complete */
    runLettaCli: (args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> =>
        electron.ipcRenderer.invoke("run-letta-cli", args),

    /** Spawn a letta CLI command and return a processId immediately.
     *  Subscribe to onLettaCliOutput to receive streamed chunks. */
    startLettaCliStream: (args: string[]): Promise<{ processId: string }> =>
        electron.ipcRenderer.invoke("start-letta-cli-stream", args),

    /** Subscribe to stdout/stderr/end chunks from a streaming CLI process */
    onLettaCliOutput: (callback: (payload: { processId: string; type: "stdout" | "stderr" | "end"; data?: string; exitCode?: number }) => void) => {
        const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload);
        electron.ipcRenderer.on("letta-cli-output", cb);
        return () => electron.ipcRenderer.off("letta-cli-output", cb);
    },

    /** Kill a running CLI stream process */
    killLettaCli: (processId: string): Promise<void> =>
        electron.ipcRenderer.invoke("kill-letta-cli", processId),

    // ============================================
    // Letta-Code Tools (register tools as agent capabilities)
    // ============================================

    /** Register all letta-code tools on the Letta server */
    registerLettaCodeTools: (overwrite?: boolean): Promise<Array<{ name: string; status: string; id?: string; error?: string }>> =>
        electron.ipcRenderer.invoke("register-letta-code-tools", overwrite ?? true),

    /** Attach all registered letta-code tools to a specific agent */
    attachLettaCodeToolsToAgent: (agentId: string): Promise<{ attached: string[]; failed: string[] }> =>
        electron.ipcRenderer.invoke("attach-letta-code-tools", agentId),

    /** List which letta-code tools are already registered on the server */
    listLettaCodeTools: (): Promise<Array<{ name: string; id: string; registered: boolean }>> =>
        electron.ipcRenderer.invoke("list-letta-code-tools"),

    // ============================================
    // Vera Cowork API Integration
    // ============================================
    
    // API Configuration
    apiSetUrl: (url: string) =>
        electron.ipcRenderer.invoke("api:set-url", url),
    apiGetUrl: () =>
        electron.ipcRenderer.invoke("api:get-url"),
    
    // Authentication
    apiIsAuthenticated: () =>
        electron.ipcRenderer.invoke("api:is-authenticated"),
    apiGetCurrentUser: () =>
        electron.ipcRenderer.invoke("api:get-current-user"),
    apiLogin: (email: string, password: string) =>
        electron.ipcRenderer.invoke("api:login", { email, password }),
    apiRegister: (data: { email: string; password: string; name?: string; organizationName?: string }) =>
        electron.ipcRenderer.invoke("api:register", data),
    apiLogout: () =>
        electron.ipcRenderer.invoke("api:logout"),
    
    // Channels
    apiListChannels: () =>
        electron.ipcRenderer.invoke("api:list-channels"),
    apiCreateChannel: (data: { provider: string; name: string; externalId?: string; config?: any }) =>
        electron.ipcRenderer.invoke("api:create-channel", data),
    apiGetChannel: (channelId: string) =>
        electron.ipcRenderer.invoke("api:get-channel", channelId),
    apiDeleteChannel: (channelId: string) =>
        electron.ipcRenderer.invoke("api:delete-channel", channelId),
    
    // Channel Credentials
    apiGetChannelCredentials: (channelId: string) =>
        electron.ipcRenderer.invoke("api:get-channel-credentials", channelId),
    apiSetChannelCredentials: (channelId: string, data: { credentials: Record<string, string>; secureConfig?: any }) =>
        electron.ipcRenderer.invoke("api:set-channel-credentials", channelId, data),
    apiDeleteChannelCredentials: (channelId: string) =>
        electron.ipcRenderer.invoke("api:delete-channel-credentials", channelId),
    apiUpdateChannelConfig: (channelId: string, config: Record<string, any>) =>
        electron.ipcRenderer.invoke("api:update-channel-config", channelId, config),
    
    // Channel Runtime
    apiStartChannel: (channelId: string) =>
        electron.ipcRenderer.invoke("api:start-channel", channelId),
    apiStopChannel: (channelId: string) =>
        electron.ipcRenderer.invoke("api:stop-channel", channelId),
    apiGetChannelStatus: (channelId: string) =>
        electron.ipcRenderer.invoke("api:get-channel-status", channelId),
    apiGetAllRuntimeStatus: () =>
        electron.ipcRenderer.invoke("api:get-all-runtime-status"),
    
    // Messages
    apiGetMessageLogs: (channelId: string, options?: { direction?: string; limit?: number; offset?: number }) =>
        electron.ipcRenderer.invoke("api:get-message-logs", channelId, options),
    apiSendMessage: (channelId: string, to: string, content: string) =>
        electron.ipcRenderer.invoke("api:send-message", channelId, to, content),
    
    // Conversation Context
    apiGetConversationContext: (channelId: string, options?: { limit?: number; since?: string }) =>
        electron.ipcRenderer.invoke("api:get-conversation-context", channelId, options),
    apiGetGroupConversationContext: (channelId: string, groupId: string, options?: { limit?: number; since?: string }) =>
        electron.ipcRenderer.invoke("api:get-group-conversation-context", channelId, groupId, options),

    // ── Scheduler ────────────────────────────────────────────────────────────
    schedulerList: () =>
        electron.ipcRenderer.invoke("scheduler:list"),
    schedulerCreate: (dto: Record<string, unknown>) =>
        electron.ipcRenderer.invoke("scheduler:create", dto),
    schedulerUpdate: (id: string, dto: Record<string, unknown>) =>
        electron.ipcRenderer.invoke("scheduler:update", id, dto),
    schedulerToggle: (id: string) =>
        electron.ipcRenderer.invoke("scheduler:toggle", id),
    schedulerDelete: (id: string) =>
        electron.ipcRenderer.invoke("scheduler:delete", id),
    schedulerRunNow: (id: string) =>
        electron.ipcRenderer.invoke("scheduler:run-now", id),
    schedulerRuns: (id: string, limit?: number, offset?: number) =>
        electron.ipcRenderer.invoke("scheduler:runs", id, limit, offset),
} as const)

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
