/**
 * Express Server Setup
 * Creates and configures the Express server with all routes
 */

import { BrowserWindow } from "electron";
import express from "express";
import { OAUTH_PORT } from "../helper.js";
import { oauthCallbackHandler } from "./oauth-handler.js";
import { fetchEmailsHandler, fetchEmailByIdHandler, searchEmailsHandler } from "./email-handlers.js";
import { fetchAccountHandler, fetchFoldersHandler } from "./account-handlers.js";
import { downloadAttachmentHandler, uploadToAgentHandler } from "./attachment-handlers.js";
import { processedEmailsHandler } from "./processed-email-handlers.js";
import { lettaConversationHandler, lettaMessagesHandler, lettaAgentHandler } from "./letta-handlers.js";
import { agentCapabilitiesHandler } from "./capabilities.js";
import { neo4jExplainHandler, neo4jRunQueryHandler, neo4jRunReadQueryHandler } from './neo4j-handlers.js';

/**
 * Create and configure the Express server
 */
export function createExpressServer(mainWindow: BrowserWindow): express.Express {
  const api = express();
  api.use(express.json());

  // Store mainWindow reference for OAuth callback
  api.set("mainWindow", mainWindow);

  // ============================================
  // OAuth Endpoint
  // ============================================
  api.get("/callback", oauthCallbackHandler);

  // ============================================
  // Account Endpoints
  // ============================================
  api.get("/fetchAccount", fetchAccountHandler);
  api.get("/fetchFolders", fetchFoldersHandler);

  // ============================================
  // Email Endpoints
  // ============================================
  api.get("/fetchEmails", fetchEmailsHandler);
  api.get("/fetchEmailById", fetchEmailByIdHandler);
  api.get("/searchEmails", searchEmailsHandler);

  // ============================================
  // Attachment Endpoints
  // ============================================
  api.get("/downloadAttachment", downloadAttachmentHandler);
  api.get("/uploadToAgent", uploadToAgentHandler);

  // ============================================
  // Processed Email Endpoints
  // ============================================
  api.get("/processedEmails", processedEmailsHandler);

  // ============================================
  // Letta API Endpoints
  // ============================================
  api.get("/letta/conversation/:conversationId", lettaConversationHandler);
  api.get("/letta/conversation/:conversationId/messages", lettaMessagesHandler);
  api.get("/letta/agent/:agentId", lettaAgentHandler);

  // ============================================
  // Agent Capabilities Documentation
  // ============================================
  api.get("/agent-capabilities", agentCapabilitiesHandler);

  // ============================================
  // Neo4j Proxy Endpoints
  // ============================================
  api.post('/neo4j/runQuery', neo4jRunQueryHandler);
  api.post('/neo4j/runReadQuery', neo4jRunReadQueryHandler);
  api.post('/neo4j/explain', neo4jExplainHandler);

  return api;
}

/**
 * Start the Express server
 */
export function startExpressServer(api: express.Express): void {
  api.listen(OAUTH_PORT, () => {
    console.log(`Local OAuth server running on http://localhost:${OAUTH_PORT}`);
  });
}
