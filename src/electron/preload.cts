import electron from "electron";

electron.contextBridge.exposeInMainWorld("electron", {
    subscribeStatistics: (callback) =>
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

    getRecentCwds: (limit?: number) =>
        ipcInvoke("get-recent-cwds", limit),
    selectDirectory: () =>
        ipcInvoke("select-directory"),

    // ✅ ADD THIS
    openExternal: (url: string) => electron.ipcRenderer.invoke("open-external", url),
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
    
    // Cowork settings
    getCoworkSettings: () =>
        electron.ipcRenderer.invoke("get-cowork-settings"),
    updateCoworkSettings: (updates: any) =>
        electron.ipcRenderer.invoke("update-cowork-settings", updates),
    resetCoworkSettings: () =>
        electron.ipcRenderer.invoke("reset-cowork-settings"),
} satisfies Window['electron'])

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
