/**
 * Email Server Client
 * 
 * Provides email operations via the vera-cowork-server API.
 * This replaces the direct Zoho API calls with server-side calls.
 */

import { getVeraCoworkApiClient } from '../apiClient.js';

// Types
export interface EmailAccount {
  accountId: string;
  accountName: string;
  email: string;
  serviceProvider: string;
}

export interface EmailFolder {
  folderId: string;
  folderName: string;
  folderType: string;
  unreadCount?: number;
  totalCount?: number;
}

export interface EmailMessage {
  messageId: string;
  subject: string;
  from: string;
  to: string;
  cc?: string;
  text?: string;
  html?: string;
  receivedTime: number;
  sentDate?: string;
  status: 'read' | 'unread';
  hasAttachment: boolean;
  attachments: EmailAttachment[];
  folderId?: string;
  accountId?: string;
}

export interface EmailAttachment {
  attachmentId: string;
  name: string;
  contentType: string;
  size: number;
}

export interface EmailListParams {
  folderId?: string;
  limit?: number;
  start?: number;
  status?: 'read' | 'unread' | 'all';
}

export interface SearchEmailParams {
  searchKey: string;
  limit?: number;
  start?: number;
}

// ============================================
// Email Channel Manager
// ============================================

let currentEmailChannelId: string | null = null;

export function setEmailChannelId(channelId: string | null): void {
  currentEmailChannelId = channelId;
}

export function getEmailChannelId(): string | null {
  return currentEmailChannelId;
}

/**
 * Fetch and cache the email channel ID from the server.
 * Call this after OAuth completes or on app startup.
 */
export async function fetchAndCacheEmailChannelId(): Promise<string | null> {
  try {
    const api = getVeraCoworkApiClient();
    const channels = await api.listChannels();
    const emailChannel = channels.find((c: any) => c.provider === 'email' && c.isActive);
    
    if (emailChannel) {
      currentEmailChannelId = emailChannel.id;
      return emailChannel.id;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch email channel ID:', error);
    return null;
  }
}

// ============================================
// Email Operations
// ============================================

export async function fetchEmailAccounts(): Promise<{ data: EmailAccount[] }> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  const result = await api.getEmailAccounts(channelId);
  return { data: result.accounts };
}

export async function fetchEmailFolders(accountId?: string): Promise<{ data: EmailFolder[] }> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  const result = await api.getEmailFolders(channelId, accountId);
  return { data: result.folders };
}

export async function fetchEmails(
  accountId: string | undefined,
  params: EmailListParams = {}
): Promise<{ data: EmailMessage[]; status: { code: number; description: string } }> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  const result = await api.getEmails(channelId, {
    ...params,
    folderId: params.folderId,
  });

  return {
    data: result.messages,
    status: { code: 200, description: 'OK' },
  };
}

export async function fetchEmailById(
  messageId: string,
  accountId?: string,
  folderId?: string
): Promise<EmailMessage> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  return api.getEmailById(channelId, messageId, { accountId, folderId });
}

export async function searchEmails(
  accountId: string | undefined,
  params: SearchEmailParams
): Promise<{ data: EmailMessage[]; status: { code: number; description: string } }> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  const result = await api.searchEmails(channelId, params.searchKey, {
    limit: params.limit,
    start: params.start,
  });

  return {
    data: result.messages.map(m => ({
      messageId: m.messageId,
      subject: m.subject,
      from: m.from,
      to: m.to,
      receivedTime: m.receivedTime,
      status: m.status,
      hasAttachment: m.hasAttachment,
      attachments: [] as EmailAttachment[], // Search results don't include attachments
    })),
    status: { code: 200, description: 'OK' },
  };
}

export async function markEmailsAsRead(
  accountId: string,
  messageIds: string[]
): Promise<void> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  await api.markEmailsAsRead(channelId, messageIds);
}

export async function downloadEmailAttachment(
  folderId: string,
  messageId: string,
  accountId: string,
  agentId?: string
): Promise<{ path: string; data: Buffer; contentType: string; filename: string }> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  
  // Get attachments list first
  const attachmentsResult = await api.getEmailAttachments(channelId, messageId, { accountId, folderId });
  
  if (!attachmentsResult.attachments || attachmentsResult.attachments.length === 0) {
    throw new Error('No attachments found for this email');
  }

  // Download the first attachment (or all if needed)
  const attachment = attachmentsResult.attachments[0];
  const downloadResult = await api.downloadEmailAttachment(
    channelId,
    messageId,
    attachment.attachmentId,
    { accountId, folderId }
  );

  // Convert base64 to Buffer
  const data = Buffer.from(downloadResult.data, 'base64');

  return {
    path: downloadResult.filename,
    data,
    contentType: downloadResult.contentType,
    filename: downloadResult.filename,
  };
}

export async function triggerEmailSync(): Promise<void> {
  const channelId = getEmailChannelId();
  if (!channelId) {
    throw new Error('No email channel configured. Please configure email in the server first.');
  }

  const api = getVeraCoworkApiClient();
  await api.triggerEmailSync(channelId);
}
