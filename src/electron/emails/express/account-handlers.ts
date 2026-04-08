/**
 * Account Handlers
 * Handles account-related endpoints: fetchAccount, fetchFolders
 */

import type { Request, Response } from "express";
import { fetchAccounts, fetchFolders } from "../fetchEmails.js";
import type { ExpressHandler } from "./types.js";

/**
 * Fetch all connected Zoho mail accounts
 * GET /fetchAccount
 */
export const fetchAccountHandler: ExpressHandler = async (_req: Request, res: Response) => {
  try {
    const accounts = await fetchAccounts();
    res.json(accounts);
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    const err = error as Error;
    res.status(500).send(err.message || "Failed to fetch accounts");
  }
};

/**
 * Fetch all folders for the connected Zoho account
 * GET /fetchFolders
 */
export const fetchFoldersHandler: ExpressHandler = async (_req: Request, res: Response) => {
  try {
    const folders = await fetchFolders();
    res.json(folders);
  } catch (error) {
    console.error("Failed to fetch folders:", error);
    const err = error as Error;
    res.status(500).send(err.message || "Failed to fetch folders");
  }
};
