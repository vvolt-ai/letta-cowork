/**
 * Attachment IPC handlers
 * Handles email attachment operations: upload, download
 */

import { ipcMain } from "electron";
import {
    downloadEmailAttachment,
    uploadEmailAttachmentToAgent,
} from "../../emails/fetchEmails.js";
import { getCurrentAgentId } from "../../libs/runner/index.js";

/**
 * Register attachment-related IPC handlers
 */
export function registerAttachmentHandlers(): void {
    // Upload email attachment to agent
    ipcMain.handle("upload-email-attachment-to-agent", async (event, folderId, messageId, accountId, agentId) => {
        const targetAgentId = agentId || getCurrentAgentId() || process.env.LETTA_AGENT_ID;
        return await uploadEmailAttachmentToAgent(folderId, messageId, accountId, targetAgentId);
    });

    // Download email attachment
    ipcMain.handle("download-email-attachment", async (event, folderId, messageId, accountId) => {
        const activeAgentId = getCurrentAgentId() || process.env.LETTA_AGENT_ID;
        return await downloadEmailAttachment(folderId, messageId, accountId, activeAgentId);
    });
}
