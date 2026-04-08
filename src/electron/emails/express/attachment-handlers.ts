/**
 * Attachment Handlers
 * Handles attachment-related endpoints: downloadAttachment, uploadToAgent
 */

import type { Request, Response } from "express";
import { downloadEmailAttachment, uploadEmailAttachmentToAgent } from "../fetchEmails.js";
import { getCurrentAgentId } from "../../libs/runner/index.js";
import type { ExpressHandler, DownloadAttachmentQuery, UploadToAgentQuery } from "./types.js";

/**
 * Download attachment for a specific email
 * GET /downloadAttachment
 */
export const downloadAttachmentHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { accountId, folderId, messageId, agentId } = req.query as DownloadAttachmentQuery;
    
    const attachment = await downloadEmailAttachment(
      folderId,
      messageId,
      accountId,
      agentId
    );
    res.json(attachment);
  } catch (error) {
    console.error("Failed to download attachment:", error);
    const err = error as Error;
    res.status(500).send(err.message || "Failed to download attachment");
  }
};

/**
 * Upload attachment to Letta agent
 * GET /uploadToAgent
 * Downloads attachments for a message and uploads supported files to Letta Filesystem
 */
export const uploadToAgentHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { accountId, folderId, messageId, agentId } = req.query as UploadToAgentQuery;
    
    if (!messageId) {
      res.status(400).send("Missing messageId");
      return;
    }

    const targetAgentId =
      agentId ||
      getCurrentAgentId() ||
      process.env.LETTA_AGENT_ID;

    if (!targetAgentId) {
      res.status(400).send("Missing agentId and no active/default Letta agent is available");
      return;
    }

    const result = await uploadEmailAttachmentToAgent(
      folderId,
      messageId,
      accountId,
      targetAgentId
    );
    res.json(result);
  } catch (error) {
    console.error("Upload to agent failed:", error);
    const err = error as Error;
    res.status(500).send(err.message || "Failed to upload attachment to agent");
  }
};
