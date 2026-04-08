/**
 * Express Server Types
 * Type definitions for the local OAuth server request/response handlers
 */

import { Request, Response } from "express";

/**
 * Express request handler function type
 */
export type ExpressHandler = (req: Request, res: Response) => void | Promise<void>;

/**
 * API endpoint metadata for agent capabilities documentation
 */
export interface ApiEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
  queryParams?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  example?: string;
  examples?: string[];
  searchSyntax?: {
    format: string;
    combineWithAND: string;
    combineWithOR: string;
    exactPhrase: string;
  };
  supportedParameters?: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * Agent capabilities response structure
 */
export interface AgentCapabilitiesResponse {
  name: string;
  version: string;
  baseUrl: string;
  description: string;
  endpoints: ApiEndpoint[];
}

/**
 * OAuth callback query parameters
 */
export interface OAuthCallbackQuery {
  code?: string;
}

/**
 * OAuth token response from Zoho
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
}

/**
 * Fetch emails query parameters
 */
export interface FetchEmailsQuery {
  accountId?: string;
  folderId?: string | number;
  start?: number;
  limit?: number;
  status?: string;
  flagid?: number;
  labelid?: string | number;
  threadId?: string | number;
  sortBy?: string;
  sortOrder?: boolean;
  includeTo?: boolean;
  includeSent?: boolean;
  includeArchive?: boolean;
  attachedMails?: boolean;
  inlinedMails?: boolean;
  flaggedMails?: boolean;
  respondedMails?: boolean;
  threadedMails?: boolean;
}

/**
 * Fetch email by ID query parameters
 */
export interface FetchEmailByIdQuery {
  accountId?: string;
  folderId?: string;
  messageId?: string;
}

/**
 * Download attachment query parameters
 */
export interface DownloadAttachmentQuery {
  accountId?: string;
  folderId?: string;
  messageId?: string;
  agentId?: string;
}

/**
 * Upload to agent query parameters
 */
export interface UploadToAgentQuery {
  accountId?: string;
  folderId?: string;
  messageId?: string;
  agentId?: string;
}

/**
 * Search emails query parameters
 */
export interface SearchEmailsQuery {
  accountId?: string;
  searchKey?: string;
  receivedTime?: number;
  start?: number;
  limit?: number;
  includeto?: boolean;
}

/**
 * Processed emails query parameters
 */
export interface ProcessedEmailsQuery {
  accountId?: string;
  folderId?: string;
  messageId?: string;
}

/**
 * Letta conversation query parameters
 */
export interface LettaConversationQuery {
  agentId?: string;
  limit?: number;
}

/**
 * Letta conversation messages query parameters
 */
export interface LettaMessagesQuery {
  agentId?: string;
  limit?: number;
  order?: string;
}

export interface Neo4jQueryBody {
  query?: string;
  params?: Record<string, unknown>;
  loginUserId?: string;
}

// ============================================
// Odoo proxy body types
// ============================================

export interface OdooSearchBody {
  model: string;
  domain?: unknown[];
  fields?: string[];
  limit?: number;
  offset?: number;
  order?: string;
}

export interface OdooCountBody {
  model: string;
  domain?: unknown[];
}

export interface OdooReadBody {
  model: string;
  ids: number[];
  fields?: string[];
}

export interface OdooFieldsBody {
  model: string;
  attributes?: string[];
}

export interface OdooRunToolBody {
  toolName: string;
  args?: Record<string, unknown>;
}
