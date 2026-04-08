/**
 * OAuth Handler
 * Handles OAuth callback endpoint for Zoho Mail authentication
 */

import { BrowserWindow } from "electron";
import type { Request, Response } from "express";
import { BASE_URL, saveAccessToken, saveRefreshToken, saveAccountId, saveInboxFolderId } from "../helper.js";
import { fetchAccounts, fetchFolders } from "../fetchEmails.js";
import { storeEmailTokensOnServer } from "../../api/index.js";
import type { ExpressHandler, OAuthCallbackQuery, OAuthTokenResponse } from "./types.js";

/**
 * Handle OAuth callback from Zoho
 * Exchanges authorization code for tokens and saves them
 */
export const oauthCallbackHandler: ExpressHandler = async (req: Request, res: Response) => {
  const mainWindow = req.app.get("mainWindow") as BrowserWindow | undefined;
  
  try {
    const { code } = req.query as OAuthCallbackQuery;

    if (!code) {
      res.status(400).send("Missing code");
      return;
    }

    // Exchange auth code for tokens
    const tokenResponse = await fetch(
      `${BASE_URL}/callback?code=${code}`,
      { method: "GET" }
    );

    if (!tokenResponse.ok) {
      throw new Error("Token exchange failed");
    }

    const tokens: OAuthTokenResponse = await tokenResponse.json();
    const { access_token, refresh_token } = tokens;

    if (!access_token || !refresh_token) {
      throw new Error("Invalid token response");
    }

    // Save tokens locally (for backward compatibility)
    saveAccessToken(access_token);
    saveRefreshToken(refresh_token);

    // Save tokens to server
    try {
      await storeEmailTokensOnServer({
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: Date.now() + 3600000, // 1 hour default
      });
      console.log("[OAuth] Tokens saved to server");
    } catch (err) {
      console.warn("[OAuth] Failed to save tokens to server:", err);
    }

    // Fetch accounts and save the first account's ID
    await saveAccountAndFolderIds(access_token, refresh_token);

    // Notify renderer
    mainWindow?.webContents.send("email-connected", { success: true });

    res.send(`
      <script>window.close();</script>
      Email connected successfully.
    `);
  } catch (error) {
    console.error("OAuth exchange failed:", error);
    res.status(500).send("Token exchange failed");
  }
};

/**
 * Save account and folder IDs after OAuth
 */
async function saveAccountAndFolderIds(accessToken: string, refreshToken: string): Promise<void> {
  try {
    const accountsResponse = await fetchAccounts();
    if (accountsResponse.data && accountsResponse.data.length > 0) {
      const firstAccount = accountsResponse.data[0];
      await saveAccountId(firstAccount.accountId);

      // Fetch folders and save the Inbox folder ID
      try {
        const foldersResponse = await fetchFolders();
        if (foldersResponse.data && foldersResponse.data.length > 0) {
          const inboxFolder = foldersResponse.data.find(
            (f: any) => f.folderName?.toLowerCase() === "inbox" || f.folderType?.toLowerCase() === "inbox"
          );
          if (inboxFolder) {
            await saveInboxFolderId(inboxFolder.folderId);

            // Update server tokens with account and folder IDs
            try {
              await storeEmailTokensOnServer({
                accessToken: accessToken,
                refreshToken: refreshToken,
                tokenExpiresAt: Date.now() + 3600000,
                accountId: firstAccount.accountId,
                folderId: inboxFolder.folderId,
                email: firstAccount.primaryEmailAddress || firstAccount.emailAddress,
              });
              console.log("[OAuth] Updated server tokens with account/folder IDs");
            } catch (updateErr) {
              console.warn("[OAuth] Failed to update server tokens:", updateErr);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to fetch and save folder ID:", err);
      }
    }
  } catch (err) {
    console.warn("Failed to fetch and save account ID:", err);
  }
}
