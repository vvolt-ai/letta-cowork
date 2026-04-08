/**
 * Processed Email Handlers
 * Handles processed email endpoints from Vera Cowork server
 */

import type { Request, Response } from "express";
import { getProcessedEmailDetailsFromServer, getProcessedEmailByMessageId } from "../../api/index.js";
import type { ExpressHandler, ProcessedEmailsQuery } from "./types.js";

/**
 * Get processed email records from Vera Cowork server
 * GET /processedEmails
 * Returns conversationId and agentId for processed emails
 */
export const processedEmailsHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { accountId, folderId, messageId } = req.query as ProcessedEmailsQuery;

    if (!accountId || !folderId) {
      res.status(400).send("Missing accountId or folderId");
      return;
    }

    // If messageId is provided, get single record
    if (messageId) {
      const record = await getProcessedEmailByMessageId(
        accountId,
        folderId,
        messageId
      );
      if (!record) {
        res.status(404).send("Processed email not found");
        return;
      }
      res.json(record);
      return;
    }

    // Otherwise get all records
    const records = await getProcessedEmailDetailsFromServer(
      accountId,
      folderId
    );
    res.json({ records });
  } catch (error) {
    console.error("Failed to fetch processed emails:", error);
    res.status(500).send("Failed to fetch processed emails");
  }
};
