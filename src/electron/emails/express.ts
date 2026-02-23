
/* ============================================================
   EXPRESS LOCAL OAUTH SERVER
============================================================ */

import { BrowserWindow } from "electron";
import express, { Request, Response } from "express";
import { BASE_URL, OAUTH_PORT, saveAccessToken, saveRefreshToken } from "./helper.js";
import { downloadEmailAttachment, fetchAccounts, fetchEmails, fetchFolders } from "./fetchEmails.js";



export const expressServer = (mainWindow: BrowserWindow) => {
  const api = express();

  api.get("/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;

      if (!code) {
        return res.status(400).send("Missing code");
      }

      // Exchange auth code for tokens
      const tokenResponse = await fetch(
        `${BASE_URL}/callback?code=${code}`,
        { method: "GET" }
      );

      if (!tokenResponse.ok) {
        throw new Error("Token exchange failed");
      }

      const tokens = await tokenResponse.json();
      const { access_token, refresh_token } = tokens;

      if (!access_token || !refresh_token) {
        throw new Error("Invalid token response");
      }

      saveAccessToken(access_token);
      saveRefreshToken(refresh_token);

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
  });

  api.get("/fetchAccount", async (req: Request, res: Response) => {
    try {
      fetchAccounts().then(accounts => res.json(accounts))
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/fetchEmails", async (req: Request, res: Response) => {
    try {
      const { accountId, folderId } = req.query;
      fetchEmails(accountId as string, { folderId: folderId as string }).then(emails => res.json(emails))
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/fetchFolders", async (req: Request, res: Response) => {
    try {
      fetchFolders().then(folders => res.json(folders))
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/downloadAttachment", async (req: Request, res: Response) => {
    try {
      const { accountId, folderId, messageId } = req.query;
      downloadEmailAttachment(folderId as string, messageId as string, accountId as string).then(attachment => res.json(attachment))
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/agent-capabilities", (req: Request, res: Response) => {
    res.json({
      name: "Zoho Mail Local API",
      version: "1.0.0",
      baseUrl: "http://localhost:4321",
      description: "Local Electron Zoho mail integration APIs available for AI agents.",
      endpoints: [
        {
          name: "fetchAccount",
          method: "GET",
          path: "/fetchAccount",
          description: "Fetch all connected Zoho mail accounts.",
          queryParams: [],
          example: "GET /fetchAccount",
        },
        {
          name: "fetchFolders",
          method: "GET",
          path: "/fetchFolders",
          description: "Fetch all folders for the connected Zoho account.",
          queryParams: [],
          example: "GET /fetchFolders",
        },
        {
          name: "fetchEmails",
          method: "GET",
          path: "/fetchEmails",
          description: "Fetch emails from a specific folder.",
          queryParams: [
            {
              name: "accountId",
              type: "string",
              required: true
            },
            {
              name: "folderId",
              type: "string",
              required: true
            }
          ],
          example: "GET /fetchEmails?accountId=123&folderId=456",
        },
        {
          name: "downloadAttachment",
          method: "GET",
          path: "/downloadAttachment",
          description: "Download attachment for a specific email.",
          queryParams: [
            { name: "accountId", type: "string", required: true },
            { name: "folderId", type: "string", required: true },
            { name: "messageId", type: "string", required: true }
          ],
          example:
            "GET /downloadAttachment?accountId=123&folderId=456&messageId=789",
        }
      ]
    });
  });


  api.listen(OAUTH_PORT, () => {
    console.log(`Local OAuth server running on http://localhost:${OAUTH_PORT}`);
  });
};
