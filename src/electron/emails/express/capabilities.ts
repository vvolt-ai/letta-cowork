/**
 * Agent Capabilities
 * Endpoint documentation for AI agents
 */

import type { Request, Response } from "express";
import type { ExpressHandler, AgentCapabilitiesResponse } from "./types.js";
import { SERVER_CONFIG } from "./config.js";

/**
 * Get agent capabilities documentation
 * GET /agent-capabilities
 */
export const agentCapabilitiesHandler: ExpressHandler = (_req: Request, res: Response) => {
  const response: AgentCapabilitiesResponse = {
    name: "Zoho Mail Local API",
    version: "1.0.0",
    baseUrl: SERVER_CONFIG.baseUrl,
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
          { name: "accountId", type: "string", required: false },
          { name: "folderId", type: "string", required: false },
          { name: "start", type: "number", required: false },
          { name: "limit", type: "number", required: false },
          { name: "status", type: "string", required: false },
          { name: "flagid", type: "number", required: false },
          { name: "labelid", type: "string", required: false },
          { name: "threadId", type: "string", required: false },
          { name: "sortBy", type: "string", required: false },
          { name: "sortOrder", type: "boolean", required: false },
          { name: "includeTo", type: "boolean", required: false },
          { name: "includeSent", type: "boolean", required: false },
          { name: "includeArchive", type: "boolean", required: false },
          { name: "attachedMails", type: "boolean", required: false },
          { name: "inlinedMails", type: "boolean", required: false },
          { name: "flaggedMails", type: "boolean", required: false },
          { name: "respondedMails", type: "boolean", required: false },
          { name: "threadedMails", type: "boolean", required: false }
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
        example: "GET /downloadAttachment?accountId=123&folderId=456&messageId=789",
      },
      {
        name: "uploadToAgent",
        method: "GET",
        path: "/uploadToAgent",
        description: "Download attachments for a message and upload supported files (.pdf, .txt, .md, .json, .docx, .html) to Letta Filesystem, then attach the created folder to an agent.",
        queryParams: [
          { name: "messageId", type: "string", required: true },
          { name: "agentId", type: "string", required: false },
          { name: "accountId", type: "string", required: false },
          { name: "folderId", type: "string", required: false }
        ],
        example: "GET /uploadToAgent?messageId=789&agentId=agent-xxx",
      },
      {
        name: "searchEmails",
        method: "GET",
        path: "/searchEmails",
        description: "Search emails using Zoho Mail advanced search syntax. The searchKey must follow Zoho's structured format using parameter:value pairs. Multiple conditions can be combined using '::' (AND) or '::or:' (OR).",
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
          exactPhrase: "Use double quotes around phrase"
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
      },
      {
        name: "draftEmail",
        method: "POST",
        path: "/draftEmail",
        description: "Create an email draft with recipients, subject, body (text or HTML), and optional attachments. Returns the Zoho draft response.",
        example: 'POST /draftEmail {"to":["user@example.com"],"subject":"Hello","bodyText":"Hi there"}',
      },
      {
        name: "sendEmail",
        method: "POST",
        path: "/sendEmail",
        description: "Send an email immediately. Accepts the same payload as /draftEmail plus an optional draftId to send an existing draft.",
        example: 'POST /sendEmail {"to":["user@example.com"],"subject":"Update","bodyHtml":"<p>Hi</p>"}',
      },
      {
        name: "processedEmails",
        method: "GET",
        path: "/processedEmails",
        description: "Get processed email records from Vera Cowork server. Returns conversationId and agentId for processed emails.",
        queryParams: [
          { name: "accountId", type: "string", required: true },
          { name: "folderId", type: "string", required: true },
          { name: "messageId", type: "string", required: false, description: "Get single record by messageId" }
        ],
        examples: [
          "GET /processedEmails?accountId=123&folderId=456",
          "GET /processedEmails?accountId=123&folderId=456&messageId=789"
        ]
      },
      {
        name: "lettaConversation",
        method: "GET",
        path: "/letta/conversation/:conversationId",
        description: "Get conversation details from Letta API.",
        queryParams: [
          { name: "agentId", type: "string", required: false, description: "Agent ID to fetch messages from" },
          { name: "limit", type: "number", required: false, description: "Max messages to return (default: 50)" }
        ],
        examples: [
          "GET /letta/conversation/conv-abc123",
          "GET /letta/conversation/conv-abc123?agentId=agent-xyz&limit=100"
        ]
      },
      {
        name: "lettaConversationMessages",
        method: "GET",
        path: "/letta/conversation/:conversationId/messages",
        description: "Get messages from a Letta conversation.",
        queryParams: [
          { name: "agentId", type: "string", required: true },
          { name: "limit", type: "number", required: false, description: "Max messages to return (default: 50)" },
          { name: "order", type: "string", required: false, description: "asc or desc (default: asc)" }
        ],
        examples: [
          "GET /letta/conversation/conv-abc123/messages?agentId=agent-xyz",
          "GET /letta/conversation/conv-abc123/messages?agentId=agent-xyz&limit=100&order=desc"
        ]
      },
      {
        name: "lettaAgent",
        method: "GET",
        path: "/letta/agent/:agentId",
        description: "Get agent details from Letta API.",
        examples: [
          "GET /letta/agent/agent-xyz123"
        ]
      },
      {
        name: 'neo4jRunQuery',
        method: 'POST',
        path: '/neo4j/runQuery',
        description: 'Proxy a Neo4j query to Vera Cowork server. Use for advanced graph queries. Message-node isolation is enforced by backend when applicable.',
        example: 'POST /neo4j/runQuery with JSON body {"query":"MATCH (e:Email) RETURN e LIMIT 5","params":{}}',
      },
      {
        name: 'neo4jRunReadQuery',
        method: 'POST',
        path: '/neo4j/runReadQuery',
        description: 'Preferred safe Neo4j endpoint for read-only graph queries. Use this for retrieval whenever possible.',
        example: 'POST /neo4j/runReadQuery with JSON body {"query":"MATCH (a:Account)-[:HAS_EMAIL]->(e:Email) RETURN e LIMIT 10","params":{}}',
      },
      {
        name: 'neo4jExplain',
        method: 'POST',
        path: '/neo4j/explain',
        description: 'Explain how a Neo4j query will be modified by backend safety rules such as Message isolation.',
        example: 'POST /neo4j/explain with JSON body {"query":"MATCH (m:Message) RETURN m LIMIT 5","params":{}}',
      }
    ]
  };
  
  res.json(response);
};
