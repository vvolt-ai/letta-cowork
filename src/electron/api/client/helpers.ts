/**
 * API Client Helper Functions
 * 
 * Singleton management and convenience functions for processed email operations.
 */

import type { AutoSyncEmailConfig, ProcessedEmailRecord, EmailTokens } from "../types.js";
import { VeraCoworkApiClient } from "./letta-client.js";
import { ProcessedEmailEndpoints } from "../endpoints/processed-emails.js";

// ============================================
// Singleton Instance Management
// ============================================

let apiClientInstance: VeraCoworkApiClient | null = null;

export function getVeraCoworkApiClient(): VeraCoworkApiClient {
  if (!apiClientInstance) {
    apiClientInstance = new VeraCoworkApiClient();
  }
  return apiClientInstance;
}

export function setVeraCoworkApiUrl(url: string): void {
  apiClientInstance = new VeraCoworkApiClient(url);
}

export function setAuthExpiredCallback(callback: (() => void) | null): void {
  getVeraCoworkApiClient().onAuthExpired = callback;
}

// ============================================
// Processed Email Helper Functions
// ============================================

export async function getEmailConfigFromServer(): Promise<AutoSyncEmailConfig> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.getEmailConfig(api);
}

export async function updateEmailConfigOnServer(config: Partial<AutoSyncEmailConfig>): Promise<AutoSyncEmailConfig> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.updateEmailConfig(api, config);
}

export async function getProcessedEmailIdsFromServer(accountId: string, folderId: string): Promise<string[]> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.getProcessedEmailIds(api, accountId, folderId);
}

export async function getProcessedEmailDetailsFromServer(accountId: string, folderId: string): Promise<ProcessedEmailRecord[]> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.getProcessedEmailDetails(api, accountId, folderId);
}

export async function setProcessedEmailIdsToServer(accountId: string, folderId: string, ids: string[], conversationId?: string, agentId?: string): Promise<void> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.setProcessedEmailIds(api, accountId, folderId, ids, conversationId, agentId);
}

export async function markEmailAsProcessedOnServer(
  accountId: string, 
  folderId: string, 
  messageId: string, 
  conversationId?: string, 
  agentId?: string
): Promise<{ success: boolean; id?: string }> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.markEmailAsProcessed(api, accountId, folderId, messageId, conversationId, agentId);
}

export async function getProcessedEmailByMessageId(
  accountId: string,
  folderId: string,
  messageId: string
): Promise<ProcessedEmailRecord | null> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.getProcessedEmailByMessageId(api, accountId, folderId, messageId);
}

export async function clearProcessedEmailIdsOnServer(accountId: string, folderId: string): Promise<void> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.clearProcessedEmailIds(api, accountId, folderId);
}

export async function storeEmailTokensOnServer(tokens: EmailTokens): Promise<{ success: boolean; channelId?: string }> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.storeEmailTokens(api, tokens);
}

export async function getEmailTokenMetadataFromServer(): Promise<{ hasCredentials: boolean }> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.getEmailTokenMetadata(api);
}

export async function deleteEmailTokensOnServer(): Promise<{ success: boolean }> {
  const api = getVeraCoworkApiClient();
  return ProcessedEmailEndpoints.deleteEmailTokens(api);
}
