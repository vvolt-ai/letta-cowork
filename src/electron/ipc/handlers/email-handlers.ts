/**
 * Email IPC handlers
 * Handles email operations: folders, accounts, emails, sync config
 */

import { ipcMain } from "electron";
import {
    checkAlreadyConnected,
    connectEmail,
    disconnectEmail,
    fetchEmailById,
    fetchEmailDetails,
    fetchEmails,
    fetchFolders,
    fetchAccounts,
    updateMessages,
    searchEmails,
} from "../../emails/fetchEmails.js";
import {
    getCoworkSettings,
    updateCoworkSettings,
    resetCoworkSettings,
    getAutoSyncUnreadConfig,
    updateAutoSyncUnreadConfig,
    resetAutoSyncUnreadConfig,
    getProcessedUnreadEmailIds,
    setProcessedUnreadEmailIds,
    clearProcessedUnreadEmailIds,
    getProcessedUnreadEmailDebugInfo,
    type AutoSyncUnreadConfig,
    type CoworkSettings,
} from "../../services/settings/index.js";

/**
 * Register email-related IPC handlers
 */
export function registerEmailHandlers(): void {
    // Folder and account operations
    ipcMain.handle("fetch-folders", async () => {
        return await fetchFolders();
    });

    ipcMain.handle("fetch-accounts", async () => {
        return await fetchAccounts();
    });

    ipcMain.handle("fetch-emails", async (event, accountId, params) => {
        return await fetchEmails(accountId, params);
    });

    // Email connection
    ipcMain.handle("connect-email", connectEmail);
    ipcMain.handle("disconnect-email", disconnectEmail);
    ipcMain.handle("is-email-already-connected", checkAlreadyConnected);

    // Email details
    ipcMain.handle("fetch-email-by-id", async (event, accountId, folderId, messageId) => {
        return await fetchEmailById(messageId, accountId, folderId);
    });

    ipcMain.handle("fetch-email-details", async (event, accountId, folderId, messageId) => {
        return await fetchEmailDetails(messageId, accountId, folderId);
    });

    // Message operations
    ipcMain.handle("update-messages", async (event, accountId, body) => {
        return await updateMessages(accountId, body);
    });

    ipcMain.handle("search-emails", async (event, accountId, params) => {
        return await searchEmails(accountId, params);
    });

    // Cowork settings handlers
    ipcMain.handle("get-cowork-settings", (): CoworkSettings => {
        return getCoworkSettings();
    });

    ipcMain.handle("update-cowork-settings", (_, updates: Partial<CoworkSettings>): CoworkSettings => {
        return updateCoworkSettings(updates);
    });

    ipcMain.handle("reset-cowork-settings", (): CoworkSettings => {
        return resetCoworkSettings();
    });

    // Auto-sync unread config handlers
    ipcMain.handle("get-auto-sync-unread-config", async (): Promise<AutoSyncUnreadConfig> => {
        try {
            const { getEmailConfigFromServer } = await import("../../api/index.js");
            const config = await getEmailConfigFromServer();
            console.log('[Email Config] Loaded from server:', config);
            return {
                enabled: config.enabled,
                agentIds: config.agentIds,
                routingRules: config.routingRules,
                sinceDate: config.sinceDate,
                processingMode: config.processingMode,
                markAsReadAfterProcess: config.markAsReadAfterProcess,
            };
        } catch (error) {
            console.warn('[Email Config] Server failed, using local storage:', error);
            return getAutoSyncUnreadConfig();
        }
    });

    ipcMain.handle("update-auto-sync-unread-config", async (_, updates: Partial<AutoSyncUnreadConfig>): Promise<AutoSyncUnreadConfig> => {
        try {
            const { updateEmailConfigOnServer } = await import("../../api/index.js");
            const config = await updateEmailConfigOnServer(updates);
            console.log('[Email Config] Saved to server:', config);
            return {
                enabled: config.enabled,
                agentIds: config.agentIds,
                routingRules: config.routingRules,
                sinceDate: config.sinceDate,
                processingMode: config.processingMode,
                markAsReadAfterProcess: config.markAsReadAfterProcess,
            };
        } catch (error) {
            console.warn('[Email Config] Server failed, using local storage:', error);
            return updateAutoSyncUnreadConfig(updates);
        }
    });

    ipcMain.handle("reset-auto-sync-unread-config", async (): Promise<AutoSyncUnreadConfig> => {
        try {
            const { updateEmailConfigOnServer } = await import("../../api/index.js");
            const config = await updateEmailConfigOnServer({
                enabled: false,
                agentIds: [],
                routingRules: [],
                sinceDate: '',
                processingMode: 'unread_only',
                markAsReadAfterProcess: true,
            });
            return {
                enabled: config.enabled,
                agentIds: config.agentIds,
                routingRules: config.routingRules,
                sinceDate: config.sinceDate,
                processingMode: config.processingMode,
                markAsReadAfterProcess: config.markAsReadAfterProcess,
            };
        } catch {
            return resetAutoSyncUnreadConfig();
        }
    });

    // Processed email IDs handlers
    ipcMain.handle("get-processed-unread-email-ids", async (_, accountId: string, folderId: string): Promise<string[]> => {
        try {
            const { getProcessedEmailIdsFromServer, getVeraCoworkApiClient } = await import("../../api/index.js");
            const api = getVeraCoworkApiClient();
            if (!api.isAuthenticated()) {
                console.warn(`[Processed IDs] Not authenticated with API, using local storage`);
                return getProcessedUnreadEmailIds(accountId, folderId);
            }
            const ids = await getProcessedEmailIdsFromServer(accountId, folderId);
            console.log(`[Processed IDs] Loaded ${ids.length} from server for ${accountId}/${folderId}`);
            return ids;
        } catch (error) {
            console.warn(`[Processed IDs] Server failed, using local storage:`, error);
            return getProcessedUnreadEmailIds(accountId, folderId);
        }
    });

    ipcMain.handle("set-processed-unread-email-ids", async (_, accountId: string, folderId: string, ids: string[]): Promise<string[]> => {
        try {
            const { setProcessedEmailIdsToServer, getVeraCoworkApiClient } = await import("../../api/index.js");
            const api = getVeraCoworkApiClient();
            if (!api.isAuthenticated()) {
                console.warn(`[Processed IDs] Not authenticated with API, using local storage`);
                return setProcessedUnreadEmailIds(accountId, folderId, ids);
            }
            await setProcessedEmailIdsToServer(accountId, folderId, ids);
            console.log(`[Processed IDs] Saved ${ids.length} to server for ${accountId}/${folderId}`);
            return ids;
        } catch (error) {
            console.warn(`[Processed IDs] Server failed, using local storage:`, error);
            return setProcessedUnreadEmailIds(accountId, folderId, ids);
        }
    });

    ipcMain.handle("clear-processed-unread-email-ids", async (_, accountId: string, folderId: string): Promise<void> => {
        try {
            const { clearProcessedEmailIdsOnServer } = await import("../../api/index.js");
            await clearProcessedEmailIdsOnServer(accountId, folderId);
            console.log(`[Processed IDs] Cleared on server for ${accountId}/${folderId}`);
        } catch (error) {
            console.warn(`[Processed IDs] Server failed, using local storage:`, error);
            clearProcessedUnreadEmailIds(accountId, folderId);
        }
    });

    // Conversation ID update
    ipcMain.handle("update-email-conversation-id", async (_, accountId: string, folderId: string, messageId: string, conversationId: string, agentId?: string): Promise<void> => {
        console.log(`[Conversation ID] IPC called with:`, { accountId, folderId, messageId, conversationId, agentId });
        try {
            const { markEmailAsProcessedOnServer, getVeraCoworkApiClient } = await import("../../api/index.js");
            const api = getVeraCoworkApiClient();
            console.log(`[Conversation ID] API authenticated:`, api.isAuthenticated());
            if (!api.isAuthenticated()) {
                console.warn(`[Conversation ID] Not authenticated with API`);
                return;
            }
            await markEmailAsProcessedOnServer(accountId, folderId, messageId, conversationId, agentId);
            console.log(`[Conversation ID] Updated ${messageId} with conversation ${conversationId}`);
        } catch (error) {
            console.warn(`[Conversation ID] Failed to update:`, error);
        }
    });

    // Debug info
    ipcMain.handle("get-processed-unread-email-debug-info", (_, accountId: string, folderId: string, limit?: number) => {
        return getProcessedUnreadEmailDebugInfo(accountId, folderId, limit);
    });

    // Get processed email details from server
    ipcMain.handle("get-processed-email-details-from-server", async (_, accountId: string, folderId: string) => {
        const { getProcessedEmailDetailsFromServer } = await import("../../api/index.js");
        return getProcessedEmailDetailsFromServer(accountId, folderId);
    });
}
