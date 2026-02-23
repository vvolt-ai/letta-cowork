// shared types for email-related API interactions

export interface ZohoAttachment {
  attachmentId: string;
  attachmentName: string;
  attachmentSize: number;
}

export interface AttachmentInfoResponse {
  data: {
    attachments: ZohoAttachment[];
  };
  status: { code: number; description: string };
}

export interface DownloadRequest {
  folderId: string;
  messageId: string;
  accountId: string;
  authToken: string;
}

// response types for Zoho account-related calls
export interface ZohoAccount {
  accountId: string;
  accountDisplayName?: string;
  incomingUserName?: string;
  type?: string;
  URI?: string;
  enabled?: boolean;
  [key: string]: any;
}

export interface AccountsResponse {
  status: { code: number; description: string };
  data: ZohoAccount[];
}

export interface EmailListParams {
  folderId: number | string;
  start?: number;
  limit?: number;
  status?: "read" | "unread" | "all";
  flagid?: number;
  labelid?: number | string;
  threadId?: number | string;
  sortBy?: "date" | "messageId" | "size";
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

export interface StoreEmailPayload {
  calendarType: number;
  ccAddress: string;
  flagid: string;
  folderId: string;
  fromAddress: string;
  hasAttachment: string;
  hasInline: string;
  messageId: string;
  priority: string;
  receivedTime: string;
  sender: string;
  sentDateInGMT: string;
  size: string;
  status: string;
  status2: string;
  subject: string;
  summary: string;
  threadCount: string;
  threadId: string;
  toAddress: string;
  accountId: string;
  attachmentUrl: string;
}

// request body for Zoho update message endpoint
export interface UpdateMessageRequest {
  mode: "markAsRead" | "markAsUnread" | string;
  messageId: (number | string)[];
}

// search email parameters
export interface SearchEmailParams {
  searchKey: string;  // e.g. "newMails", or search text
  receivedTime?: number;  // timestamp in milliseconds
  start?: number;  // pagination start
  limit?: number;  // results per page
  includeto?: boolean;  // include 'to' field
}
