/**
 * API Client Barrel Exports
 * 
 * Re-exports all API client modules for convenient importing.
 */

// Types
export type {
  AuthTokens,
  Channel,
  ChannelRuntimeStatus,
  ChannelCredentials,
  MessageLog,
  ConversationContext,
  EmailAccount,
  EmailFolder,
  EmailMessage,
  EmailAttachment,
  EmailTokens,
  AutoSyncEmailConfig,
  ProcessedEmailRecord,
  RequestOptions,
} from "./types.js";

// Client
export { BaseHttpClient } from "./client/base-client.js";
export { VeraCoworkApiClient } from "./client/letta-client.js";

// Singleton and helper functions
export {
  getVeraCoworkApiClient,
  setVeraCoworkApiUrl,
  setAuthExpiredCallback,
  getEmailConfigFromServer,
  updateEmailConfigOnServer,
  getProcessedEmailIdsFromServer,
  getProcessedEmailDetailsFromServer,
  setProcessedEmailIdsToServer,
  markEmailAsProcessedOnServer,
  getProcessedEmailByMessageId,
  clearProcessedEmailIdsOnServer,
  storeEmailTokensOnServer,
  getEmailTokenMetadataFromServer,
  deleteEmailTokensOnServer,
} from "./client/helpers.js";

// Endpoints (for advanced usage)
export { AgentEndpoints } from "./endpoints/agents.js";
export { SessionEndpoints } from "./endpoints/sessions.js";
export { ChannelEndpoints } from "./endpoints/channels.js";
export { EmailEndpoints } from "./endpoints/emails.js";
export { ProcessedEmailEndpoints } from "./endpoints/processed-emails.js";
