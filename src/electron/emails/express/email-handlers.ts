/**
 * Email Handlers
 * Handles email-related endpoints: fetchEmails, fetchEmailById, searchEmails
 */

import type { Request, Response } from "express";
import { fetchEmails, fetchEmailById, searchEmails } from "../fetchEmails.js";
import type { ExpressHandler, FetchEmailsQuery, FetchEmailByIdQuery, SearchEmailsQuery } from "./types.js";

/**
 * Fetch emails from a folder
 * GET /fetchEmails
 */
export const fetchEmailsHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { accountId, ...rest } = req.query as FetchEmailsQuery;

    // pass every other query parameter through as part of the EmailListParams object
    // the fetchEmails helper will stringify/convert values as needed
    const params = rest as any;

    // accountId is optional - if not provided, fetchEmails will use the one from keytar
    const emails = await fetchEmails(accountId, params);
    res.json(emails);
  } catch (error) {
    console.error("Failed to fetch emails:", error);
    const err = error as Error;
    res.status(500).send(err.message || "Failed to fetch emails");
  }
};

/**
 * Fetch a single email by ID
 * GET /fetchEmailById
 */
export const fetchEmailByIdHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { accountId, folderId, messageId } = req.query as FetchEmailByIdQuery;

    if (!messageId) {
      res.status(400).send("Missing messageId");
      return;
    }

    const email = await fetchEmailById(messageId, accountId, folderId);
    res.json(email);
  } catch (error) {
    console.error("Failed to fetch email by id:", error);
    res.status(500).send("Failed to fetch email by id");
  }
};

/**
 * Search emails using Zoho search syntax
 * GET /searchEmails
 */
export const searchEmailsHandler: ExpressHandler = async (req: Request, res: Response) => {
  try {
    const { accountId, ...rest } = req.query as SearchEmailsQuery;

    // convert query parameters into SearchEmailParams
    const params = rest as any;

    const emails = await searchEmails(accountId, params);
    res.json(emails);
  } catch (error) {
    console.error("Failed to search emails:", error);
    const err = error as Error;
    res.status(500).send(err.message || "Failed to search emails");
  }
};
