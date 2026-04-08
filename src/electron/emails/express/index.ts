/**
 * Express Server Entry Point
 * Main entry point for the local OAuth server
 */

import { BrowserWindow } from "electron";
import { createExpressServer, startExpressServer } from "./server.js";

// Re-export types for consumers
export type {
  ExpressHandler,
  ApiEndpoint,
  AgentCapabilitiesResponse,
  OAuthCallbackQuery,
  OAuthTokenResponse,
  FetchEmailsQuery,
  FetchEmailByIdQuery,
  DownloadAttachmentQuery,
  UploadToAgentQuery,
  SearchEmailsQuery,
  ProcessedEmailsQuery,
  LettaConversationQuery,
  LettaMessagesQuery,
} from "./types.js";

// Re-export config
export { SERVER_CONFIG, getServerPort, getServerBaseUrl } from "./config.js";

// Re-export handlers for testing
export { oauthCallbackHandler } from "./oauth-handler.js";
export { fetchEmailsHandler, fetchEmailByIdHandler, searchEmailsHandler } from "./email-handlers.js";
export { fetchAccountHandler, fetchFoldersHandler } from "./account-handlers.js";
export { downloadAttachmentHandler, uploadToAgentHandler } from "./attachment-handlers.js";
export { processedEmailsHandler } from "./processed-email-handlers.js";
export { lettaConversationHandler, lettaMessagesHandler, lettaAgentHandler } from "./letta-handlers.js";
export { neo4jRunQueryHandler, neo4jRunReadQueryHandler, neo4jExplainHandler } from './neo4j-handlers.js';
export { agentCapabilitiesHandler } from "./capabilities.js";
export { createExpressServer, startExpressServer } from "./server.js";

/**
 * Initialize and start the Express server
 * This is the main entry point for the email OAuth server
 */
export const expressServer = (mainWindow: BrowserWindow): void => {
  const api = createExpressServer(mainWindow);
  startExpressServer(api);
};
