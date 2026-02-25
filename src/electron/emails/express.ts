
/* ============================================================
   EXPRESS LOCAL OAUTH SERVER
============================================================ */

import { BrowserWindow } from "electron";
import express, { Request, Response } from "express";
import { BASE_URL, OAUTH_PORT, saveAccessToken, saveRefreshToken } from "./helper.js";
import { downloadEmailAttachment, fetchAccounts, fetchEmails, fetchFolders, searchEmails } from "./fetchEmails.js";



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
      fetchAccounts().then(accounts => res.json(accounts)).catch(err => {
        res.status(500).send(err.message || "Failed to fetch accounts");
      })
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/fetchEmails", async (req: Request, res: Response) => {
    try {
      const { accountId, folderId } = req.query;
      fetchEmails(accountId as string, { folderId: folderId as string }).then(emails => res.json(emails)).catch(err => {
        res.status(500).send(err.message || "Failed to fetch emails");
      })
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/fetchFolders", async (req: Request, res: Response) => {
    try {
      fetchFolders().then(folders => res.json(folders)).catch(err => {
        res.status(500).send(err.message || "Failed to fetch folders");
      })
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/downloadAttachment", async (req: Request, res: Response) => {
    try {
      const { accountId, folderId, messageId } = req.query;
      downloadEmailAttachment(folderId as string, messageId as string, accountId as string).then(attachment => res.json(attachment)).catch(err => {
        res.status(500).send(err.message || "Failed to download attachment");
      })
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

   api.get("/searchEmails", async (req: Request, res: Response) => {
    try {
      const { accountId, searchKey } = req.query;
      searchEmails(accountId as string, { searchKey: searchKey as string }).then(emails => res.json(emails)).catch(err => {
        res.status(500).send(err.message || "Failed to search emails");
      })
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
        },
        {
          name: "searchEmails",
          method: "GET",
          path: "/searchEmails",
          description:
            "Search emails using Zoho Mail advanced search syntax. The searchKey must follow Zoho's structured format using parameter:value pairs. Multiple conditions can be combined using '::' (AND) or '::or:' (OR).",

          queryParams: [
            { name: "accountId", type: "string", required: true },
            { name: "searchKey", type: "string", required: true },
            { name: "receivedTime", type: "number", required: false },
            { name: "start", type: "number", required: false },
            { name: "limit", type: "number", required: false },
            { name: "includeto", type: "boolean", required: false }
          ],

          searchSyntax: {
            format: "parameter:value",
            combineWithAND: "::",
            combineWithOR: "::or:",
            exactPhrase: 'Use double quotes around phrase'
          },

          supportedParameters: [
            { name: "entire", description: "Search entire email content (subject + body)." },
            { name: "content", description: "Search inside email body only." },
            { name: "sender", description: "Search by sender email address." },
            { name: "to", description: "Search by recipient email address." },
            { name: "cc", description: "Search by CC email address." },
            { name: "subject", description: "Search by subject text." },
            { name: "fileName", description: "Search by attachment filename." },
            { name: "fileContent", description: "Search inside attachment content." },
            { name: "has", description: "Filter by attachment, flags, or conversation." },
            { name: "in", description: "Search within a specific folder." },
            { name: "label", description: "Search by label/tag." },
            { name: "fromDate", description: "Start date in DD-MMM-YYYY format." },
            { name: "toDate", description: "End date in DD-MMM-YYYY format." },
            { name: "newMails", description: "Retrieve only unread emails." },
            { name: "inclspamtrash", description: "Include Spam and Trash folders." },
            { name: "groupResult", description: "Group conversation results." }
          ],

          examples: [
            "GET /searchEmails?accountId=123&searchKey=subject:Invoice",
            "GET /searchEmails?accountId=123&searchKey=sender:john@example.com::has:attachment",
            "GET /searchEmails?accountId=123&searchKey=subject:\"Payment Reminder\"",
            "GET /searchEmails?accountId=123&searchKey=fromDate:01-Jan-2024::toDate:31-Jan-2024",
            "GET /searchEmails?accountId=123&searchKey=newMails::has:attachment",
            "GET /searchEmails?accountId=123&searchKey=sender:test@example.com::or:to:test@example.com"
          ]
        }
      ]
    });
  });


  api.listen(OAUTH_PORT, () => {
    console.log(`Local OAuth server running on http://localhost:${OAUTH_PORT}`);
  });
};
