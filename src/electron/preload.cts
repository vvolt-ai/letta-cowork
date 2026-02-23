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
    checkAlreadyConnected: () =>
        electron.ipcRenderer.invoke("is-email-already-connected"),
    fetchEmailById: (accountId: string, folderId: string, messageId: string) =>
        electron.ipcRenderer.invoke("fetch-email-by-id", accountId, folderId, messageId),
    downloadEmailAttachment: (folderId: string, messageId: string, accountId: string) =>
        electron.ipcRenderer.invoke("download-email-attachment", folderId, messageId, accountId),
    markMessagesAsRead: (accountId: string, messageIds: (number | string)[]) =>
        electron.ipcRenderer.invoke("update-messages", accountId, { mode: "markAsRead", messageId: messageIds }),
    searchEmails: (accountId: string, params: any) =>
        electron.ipcRenderer.invoke("search-emails", accountId, params)
} satisfies Window['electron'])

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
