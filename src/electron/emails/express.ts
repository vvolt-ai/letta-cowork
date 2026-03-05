
/* ============================================================
   EXPRESS LOCAL OAUTH SERVER
============================================================ */

import { BrowserWindow } from "electron";
import express, { Request, Response } from "express";
import { BASE_URL, OAUTH_PORT, saveAccessToken, saveRefreshToken, saveAccountId, saveInboxFolderId } from "./helper.js";
import { downloadEmailAttachment, fetchAccounts, fetchEmails, fetchEmailById, fetchFolders, searchEmails, uploadEmailAttachmentToAgent } from "./fetchEmails.js";
import { getCurrentAgentId } from "../libs/runner.js";



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

      // Fetch accounts and save the first account's ID
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
              }
            }
          } catch (err) {
            console.warn("Failed to fetch and save folder ID:", err);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch and save account ID:", err);
      }

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
      const { accountId, ...rest } = req.query;

      // pass every other query parameter through as part of the EmailListParams object
      // the fetchEmails helper will stringify/convert values as needed
      const params = rest as any;

      // accountId is optional - if not provided, fetchEmails will use the one from keytar
      fetchEmails(accountId as string | undefined, params).then(emails => res.json(emails)).catch(err => {
        res.status(500).send(err.message || "Failed to fetch emails");
      });
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/fetchEmailById", async (req: Request, res: Response) => {
    try {
      const { accountId, folderId, messageId } = req.query;

      if (!messageId) {
        return res.status(400).send("Missing messageId");
      }

      fetchEmailById(messageId as string, accountId as string | undefined, folderId as string | undefined).then(email => res.json(email)).catch(err => {
        res.status(500).send(err.message || "Failed to fetch email by id");
      });
    } catch (error) {
      console.error("Failed to fetch email by id:", error);
      res.status(500).send("Failed to fetch email by id");
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
      const { accountId, folderId, messageId, agentId } = req.query;
      downloadEmailAttachment(folderId as string, messageId as string, accountId as string, agentId as string | undefined).then(attachment => res.json(attachment)).catch(err => {
        res.status(500).send(err.message || "Failed to download attachment");
      })
    } catch (error) {
      console.error("OAuth exchange failed:", error);
      res.status(500).send("Token exchange failed");
    }
  });

  api.get("/uploadToAgent", async (req: Request, res: Response) => {
    try {
      const { accountId, folderId, messageId, agentId } = req.query;
      if (!messageId) {
        return res.status(400).send("Missing messageId");
      }

      const targetAgentId =
        (agentId as string | undefined) ||
        getCurrentAgentId() ||
        process.env.LETTA_AGENT_ID;

      if (!targetAgentId) {
        return res.status(400).send("Missing agentId and no active/default Letta agent is available");
      }

      uploadEmailAttachmentToAgent(
        folderId as string | undefined,
        messageId as string,
        accountId as string | undefined,
        targetAgentId
      )
        .then((result) => res.json(result))
        .catch((err) => {
          res.status(500).send(err.message || "Failed to upload attachment to agent");
        });
    } catch (error) {
      console.error("Upload to agent failed:", error);
      res.status(500).send("Upload to agent failed");
    }
  });

   api.get("/searchEmails", async (req: Request, res: Response) => {
    try {
      const { accountId, ...rest } = req.query;

      // convert query parameters into SearchEmailParams
      const params = rest as any;

      searchEmails(accountId as string | undefined, params).then(emails => res.json(emails)).catch(err => {
        res.status(500).send(err.message || "Failed to search emails");
      });
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
          description: "Fetch emails from a specific folder. Supports all Zoho list parameters (folderId, start, limit, status, flagid, labelid, threadId, sortBy, sortOrder, includeTo, includeSent, includeArchive, attachedMails, inlinedMails, flaggedMails, respondedMails, threadedMails, etc.)",
          queryParams: [
            {
              name: "accountId",
              type: "string",
              required: false
            },
            {
              name: "folderId",
              type: "string",
              required: false
            },
            {
              name: "start",
              type: "number",
              required: false
            },
            {
              name: "limit",
              type: "number",
              required: false
            },
            {
              name: "status",
              type: "string",
              required: false
            },
            {
              name: "flagid",
              type: "number",
              required: false
            },
            {
              name: "labelid",
              type: "string",
              required: false
            },
            {
              name: "threadId",
              type: "string",
              required: false
            },
            {
              name: "sortBy",
              type: "string",
              required: false
            },
            {
              name: "sortOrder",
              type: "boolean",
              required: false
            },
            {
              name: "includeTo",
              type: "boolean",
              required: false
            },
            {
              name: "includeSent",
              type: "boolean",
              required: false
            },
            {
              name: "includeArchive",
              type: "boolean",
              required: false
            },
            {
              name: "attachedMails",
              type: "boolean",
              required: false
            },
            {
              name: "inlinedMails",
              type: "boolean",
              required: false
            },
            {
              name: "flaggedMails",
              type: "boolean",
              required: false
            },
            {
              name: "respondedMails",
              type: "boolean",
              required: false
            },
            {
              name: "threadedMails",
              type: "boolean",
              required: false
            }
          ],
          example: "GET /fetchEmails?accountId=123&folderId=456&start=0&limit=50",
        },
        {
          name: "fetchEmailById",
          method: "GET",
          path: "/fetchEmailById",
          description: "Fetch a single email by its message ID. Returns the full email content including body.",
          queryParams: [
            { name: "messageId", type: "string", required: true },
            { name: "accountId", type: "string", required: false },
            { name: "folderId", type: "string", required: false }
          ],
          example: "GET /fetchEmailById?messageId=789&accountId=123&folderId=456"
        },

        {
          name: "downloadAttachment",
          method: "GET",
          path: "/downloadAttachment",
          description: "Download attachment for a specific email.",
          queryParams: [
            { name: "accountId", type: "string", required: false },
            { name: "folderId", type: "string", required: false },
            { name: "messageId", type: "string", required: true },
            { name: "agentId", type: "string", required: false }
          ],
          example:
            "GET /downloadAttachment?accountId=123&folderId=456&messageId=789",
        },
        {
          name: "uploadToAgent",
          method: "GET",
          path: "/uploadToAgent",
          description:
            "Download attachments for a message and upload supported files (.pdf, .txt, .md, .json, .docx, .html) to Letta Filesystem, then attach the created folder to an agent.",
          queryParams: [
            { name: "messageId", type: "string", required: true },
            { name: "agentId", type: "string", required: false },
            { name: "accountId", type: "string", required: false },
            { name: "folderId", type: "string", required: false }
          ],
          example:
            "GET /uploadToAgent?messageId=789&agentId=agent-xxx",
        },
        {
          name: "searchEmails",
          method: "GET",
          path: "/searchEmails",
          description:
            "Search emails using Zoho Mail advanced search syntax. The searchKey must follow Zoho's structured format using parameter:value pairs. Multiple conditions can be combined using '::' (AND) or '::or:' (OR).",

          queryParams: [
            { name: "accountId", type: "string", required: false },
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
            "GET /searchEmails?searchKey=subject:Invoice",
            "GET /searchEmails?searchKey=sender:john@example.com::has:attachment"
          ]
        }
      ]
    });
  });


  api.listen(OAUTH_PORT, () => {
    console.log(`Local OAuth server running on http://localhost:${OAUTH_PORT}`);
  });
};
