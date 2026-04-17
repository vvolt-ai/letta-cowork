/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { BASE_URL, clearEmailCredentials, getAccessToken, getAccountId, getInboxFolderId, getRefreshToken, saveAccountId, saveInboxFolderId } from "./helper.js";
import { FormData, File } from 'undici';
import { getVeraCoworkApiClient } from "../api/index.js";
import { serverApiRequest, zohoApiRequest } from "./zohoApi.js";
import type {
  AttachmentInfoResponse,
  AccountsResponse,
  EmailListParams,
  SearchEmailParams,
  StoreEmailPayload,
  UpdateMessageRequest,
  UploadedEmailAttachment,
} from "./types.js";


export const fetchFolders = async () => {
  const data = await serverApiRequest("/folders");
  console.log("Fetched folders:", data);
  if (data?.folders?.length > 0) {
    const inboxFolder = data.folders.find(
      (f: any) => f.folderName?.toLowerCase() === "inbox" || f.folderType?.toLowerCase() === "inbox"
    );
    if (inboxFolder) {
      saveInboxFolderId(inboxFolder.folderId);
    }
  }
  return data;
};


export const fetchEmails = async (
  accountId?: string,
  params?: EmailListParams
) => {
  // use provided accountId or fetch from electron-store
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in electron-store");
  }

  // use provided params or empty object (typed so TS knows possible properties)
  const resolvedParams: Partial<EmailListParams> = params || {};

  // build query string from params
  const query = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      query.append(key, String(value));
    }
  });

  // call Zoho messages view endpoint directly
  const url = `/accounts/${resolvedAccountId}/messages/view?${query.toString()}`;
  const resp = await zohoApiRequest(url);

  // ensure accountId is added to each email
  if (resp && resp.data && Array.isArray(resp.data)) {
    resp.data = resp.data.map((e: any) => ({ ...e, accountId: resolvedAccountId }));

    // process each email asynchronously; don't block the response
    resp.data.forEach((email: any) => {
      void (async () => {
        const attachmentUrl = "";

        // try {
        //   if (email.hasAttachment === "1" || email.attachments?.length > 0) {
        //     const result = await downloadEmailAttachment(
        //       String(email.folderId || params.folderId),
        //       String(email.messageId),
        //       accountId
        //     );
        //     if (result && typeof result.path === "string") {
        //       attachmentUrl = result.path;
        //     }
        //   }
        // } catch (err) {
        //   console.error("Failed to download attachments for message", email.messageId, err);
        // }

        const api = getVeraCoworkApiClient();
        const userId = api.currentUser?.id;

        const payload: StoreEmailPayload = {
          calendarType: 0,
          ccAddress: email.ccAddress ?? "Not Provided",
          flagid: email.flagid ?? "flag_not_set",
          folderId: String(email.folderId ?? resolvedParams.folderId),
          fromAddress: email.fromAddress || "",
          hasAttachment: email.hasAttachment || "0",
          hasInline: email.hasInline || "false",
          messageId: String(email.messageId),
          priority: email.priority || "",
          receivedTime: email.receivedTime || "",
          sender: email.sender || "",
          sentDateInGMT: email.sentDateInGMT || "",
          size: email.size || "",
          status: email.status || "",
          status2: email.status2 || "",
          subject: email.subject || "",
          summary: email.summary || "",
          threadCount: email.threadCount || "",
          threadId: String(email.threadId || email.messageId),
          toAddress: email.toAddress || "",
          accountId: resolvedAccountId,
          attachmentUrl,
          userId,
        };

        try {
          await storeEmail(payload);
        } catch (err) {
          console.error("Failed to store email", email.messageId, err);
        }
      })();
    });
  }

  return resp;
};

export interface EmailWithAttachments {
  /** The raw email content from Zoho */
  emailContent: unknown;
  /** Uploaded attachment information */
  attachments: {
    files: UploadedEmailAttachment[];
    uploadErrors: { file: string; error: string }[];
  } | null;
}

type DownloadAttachmentResult = {
  status: string;
  files?: string[];
  path?: string;
  uploadedFiles?: UploadedEmailAttachment[];
  uploadErrors?: { file: string; error: string }[];
};

export interface EmailAttachmentInput {
  name: string;
  url: string;
  mimeType?: string;
}

export interface EmailComposePayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachmentInput[];
  fromAddress?: string;
  requestReadReceipt?: boolean;
  draftId?: string;
}

export const fetchEmailDetails = async (messageId: string, accountId?: string, folderId?: string) => {
  // resolve accountId from parameter or electron-store
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in electron-store");
  }

  // resolve folderId from parameter or electron-store (inbox)
  const resolvedFolderId = folderId || (await getInboxFolderId());
  if (!resolvedFolderId) {
    throw new Error("No folder ID provided and none found in electron-store");
  }

  if (!messageId) {
    throw new Error("Message ID is required");
  }

  // Fetch email metadata to check for attachments
  const fetchEmailDetailsUrl = `/accounts/${resolvedAccountId}/folders/${resolvedFolderId}/messages/${messageId}/details`;
  return await zohoApiRequest(fetchEmailDetailsUrl);
};

export const fetchEmailById = async (messageId: string, accountId?: string, folderId?: string): Promise<EmailWithAttachments> => {
  // resolve accountId from parameter or electron-store
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in electron-store");
  }

  // resolve folderId from parameter or electron-store (inbox)
  const resolvedFolderId = folderId || (await getInboxFolderId());
  if (!resolvedFolderId) {
    throw new Error("No folder ID provided and none found in electron-store");
  }

  if (!messageId) {
    throw new Error("Message ID is required");
  }

  // STEP 1: Fetch email metadata to check for attachments
  const emailMetadata = await fetchEmailDetails(messageId, resolvedAccountId, resolvedFolderId);
  
  // Extract hasAttachment from the data object
  const hasAttachments = emailMetadata?.data?.hasAttachment === "1" || 
                        emailMetadata?.data?.hasInline === "true";

  // STEP 2: Fetch the email content
  const fetchEmailIdUrl = `/accounts/${resolvedAccountId}/folders/${resolvedFolderId}/messages/${messageId}/content`;
  const emailContent = await zohoApiRequest(fetchEmailIdUrl);

  // STEP 3: Download attachments if present
  let attachmentsResult = null;
  
  if (hasAttachments) {
    try {
      // Download attachments - this will also convert PDFs to markdown
      const attachmentResult = await downloadEmailAttachment(
        resolvedFolderId,
        messageId,
        resolvedAccountId
      ) as DownloadAttachmentResult;
      
      attachmentsResult = {
        files: attachmentResult.uploadedFiles ?? [],
        uploadErrors: attachmentResult.uploadErrors ?? [],
      };
    } catch (attachError) {
      console.error("Failed to download attachments:", attachError);
      // Continue without attachments - don't fail the whole request
    }
  }

  return {
    emailContent,
    attachments: attachmentsResult,
  };
}

export const connectEmail = async () => {
  const response = await fetch(`${BASE_URL}/connect`);
  if (!response.ok) {
    throw new Error("Failed to get auth URL");
  }

  const data = await response.json();
  await shell.openExternal(data.auth_url);
};

export const checkAlreadyConnected = async () => {
  const accessToken = await getAccessToken();
  return !!accessToken;
};

const revokeTokenBestEffort = async (token?: string | null) => {
  if (!token) return;

  const encodedToken = encodeURIComponent(token);

  try {
    await fetch(`https://accounts.zoho.com/oauth/v2/token/revoke?token=${encodedToken}`, { method: "POST" });
  } catch {
    // best-effort only
  }
};

export const disconnectEmail = async () => {
  // Revoke first, then remove local credentials
  const [accessToken, refreshToken] = await Promise.all([
    getAccessToken(),
    getRefreshToken(),
  ]);

  await Promise.all([
    revokeTokenBestEffort(refreshToken),
    revokeTokenBestEffort(accessToken),
  ]);

  await clearEmailCredentials();
  return { success: true };
};


export const downloadEmailAttachment = async (folderId?: string, messageId?: string, accountId?: string, agentId?: string) => {
  // resolve accountId
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in electron-store");
  }

  // resolve folderId
  const resolvedFolderId = folderId || (await getInboxFolderId());
  if (!resolvedFolderId) {
    throw new Error("No folder ID provided and none found in electron-store");
  }

  if (!messageId) {
    throw new Error("Message ID is required");
  }

  const downloadDir = path.join(app.getPath('downloads'), 'ZohoAttachments', `${resolvedAccountId}_${resolvedFolderId}_${messageId}`);

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const downloadedFiles: string[] = [];
  const downloadedFilePaths: string[] = [];
  const uploadedFiles: UploadedEmailAttachment[] = [];
  const uploadErrors: { file: string; error: string }[] = [];

  try {
    // STEP 1: Fetch attachment metadata using common Zoho API helper
    const infoUrl = `/accounts/${resolvedAccountId}/folders/${resolvedFolderId}/messages/${messageId}/attachmentinfo`;
    const infoData = await zohoApiRequest(infoUrl) as AttachmentInfoResponse;

    console.log("Attachment Info:", infoData); // Debug log
    if (!infoData.data || infoData.data.attachments.length === 0) {
      return {
        status: "success" as const,
        files: downloadedFiles,
        path: downloadDir,
        uploadedFiles,
        uploadErrors,
        message: "No attachments found.",
      };
    }

    // STEP 2: Download each attachment using direct fetch + Streams
    // (can't use zohoApiRequest here because we need the binary body stream)
    const accessToken = await getAccessToken();

    for (const attach of infoData.data.attachments) {
      const downloadUrl = `https://mail.zoho.com/api/accounts/${resolvedAccountId}/folders/${resolvedFolderId}/messages/${messageId}/attachments/${attach.attachmentId}`;
      const filePath = path.join(downloadDir, attach.attachmentName);

      const fileRes = await fetch(downloadUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      });
      if (!fileRes.ok || !fileRes.body) throw new Error(`Failed to download ${attach.attachmentName}`);

      // Stream to file
      const reader = fileRes.body.getReader();
      const writer = fs.createWriteStream(filePath);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(Buffer.from(value));
      }
      writer.end();
      downloadedFiles.push(attach.attachmentName);
      downloadedFilePaths.push(filePath);
    }

    return {
      status: "success" as const,
      files: downloadedFiles,
      path: uploadedFiles.map(f => f.url).join(", ") || downloadDir,
      uploadedFiles,
      uploadErrors,
    };
  } catch (error) {
    console.error("Zoho Download Error:", error);
    throw error;
  }
};

export const uploadEmailAttachmentToAgent = async (
  folderId?: string,
  messageId?: string,
  accountId?: string,
  agentId?: string
) => {
  const resolvedAgentId = agentId || process.env.LETTA_AGENT_ID;
  if (!resolvedAgentId) {
    throw new Error("No Letta agent ID provided and LETTA_AGENT_ID is not configured");
  }

  return await downloadEmailAttachment(folderId, messageId, accountId, resolvedAgentId);
};

const HTTP_URL_PATTERN = /^https?:\/\//i;
let cachedFromAddress: string | null = null;

async function getDefaultFromAddress(): Promise<string | undefined> {
  if (cachedFromAddress) {
    return cachedFromAddress;
  }
  try {
    const accounts = await fetchAccounts();
    const primary = accounts?.data?.[0];
    const email = primary?.primaryEmailAddress || primary?.emailAddress || primary?.incomingUserName;
    if (email) {
      cachedFromAddress = email;
      return email;
    }
  } catch (error) {
    console.warn('Failed to resolve default fromAddress', error);
  }
  return undefined;
}


function normalizeAddressList(list?: string[]): string | undefined {
  if (!list || list.length === 0) return undefined;
  const trimmed = list
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return trimmed.length > 0 ? trimmed.join(",") : undefined;
}

async function loadAttachmentBuffer(location: string): Promise<Buffer> {
  if (!location) {
    throw new Error('Attachment url is required');
  }

  if (HTTP_URL_PATTERN.test(location)) {
    const response = await fetch(location);
    if (!response.ok) {
      throw new Error(`Failed to fetch attachment from ${location}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  let filePath = location;
  if (location.startsWith('file://')) {
    filePath = fileURLToPath(location);
  }

  return await fs.promises.readFile(filePath);
}

async function uploadAttachmentToZoho(accountId: string, attachment: EmailAttachmentInput) {
  if (!attachment.name || !attachment.url) {
    throw new Error('Attachment requires both name and url');
  }

  const buffer = await loadAttachmentBuffer(attachment.url);
  const MAX_SIZE_BYTES = 20 * 1024 * 1024;
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    throw new Error(`Attachment ${attachment.name} exceeds 20MB limit`);
  }

  const file = new File([buffer], attachment.name, { type: attachment.mimeType ?? 'application/octet-stream' });
  const formData = new FormData();
  formData.append('attach', file);

  const search = new URLSearchParams({ uploadType: 'multipart' });
  const response = await zohoApiRequest(`/accounts/${accountId}/messages/attachments?${search.toString()}`, {
    method: 'POST',
    body: formData as any,
  });

  const uploaded = response?.data?.attachments || response?.attachments;
  if (!uploaded || uploaded.length === 0) {
    throw new Error('Zoho attachment upload failed to return metadata');
  }
  const metadata = uploaded[0];

  if (!metadata.storeName || !metadata.attachmentPath) {
    throw new Error('Zoho attachment upload response missing storeName or attachmentPath');
  }

  return {
    attachmentName: metadata.attachmentName || attachment.name,
    attachmentPath: metadata.attachmentPath,
    storeName: metadata.storeName,
  };
}

async function transformAttachments(accountId: string, inputs?: EmailAttachmentInput[]): Promise<
  | Array<{ attachmentName: string; attachmentPath: string; storeName: string }>
  | undefined
> {
  if (!inputs || inputs.length === 0) return undefined;
  const results = await Promise.all(inputs.map((input) => uploadAttachmentToZoho(accountId, input)));
  return results.length ? results : undefined;
}

async function buildMaildataFromPayload(accountId: string, payload: EmailComposePayload) {
  if (!payload.subject || !payload.subject.trim()) {
    throw new Error('Email subject is required');
  }

  const toAddress = normalizeAddressList(payload.to);
  if (!toAddress) {
    throw new Error('At least one recipient is required');
  }

  const content = payload.bodyHtml ?? payload.bodyText;
  if (!content || !content.trim()) {
    throw new Error('Either bodyHtml or bodyText must be provided');
  }

  const ccAddress = normalizeAddressList(payload.cc);
  const bccAddress = normalizeAddressList(payload.bcc);
  const attachments = await transformAttachments(accountId, payload.attachments);

  const maildata: Record<string, unknown> = {
    subject: payload.subject,
    toAddress,
    content,
  };

  const fromAddress = payload.fromAddress || (await getDefaultFromAddress());
  if (fromAddress) maildata.fromAddress = fromAddress;
  if (ccAddress) maildata.ccAddress = ccAddress;
  if (bccAddress) maildata.bccAddress = bccAddress;
  if (payload.requestReadReceipt) maildata.askReceipt = 'yes';
  if (attachments) maildata.attachments = attachments;

  return maildata;
}

export async function createEmailDraft(payload: EmailComposePayload) {
  const accountId = await getAccountId();
  if (!accountId) {
    throw new Error('Email account is not connected. Please connect Zoho Mail first.');
  }

  const maildata = await buildMaildataFromPayload(accountId, payload);
  return zohoApiRequest(`/accounts/${accountId}/drafts`, {
    method: 'POST',
    body: JSON.stringify({ maildata }),
  });
}

export async function sendComposedEmail(payload: EmailComposePayload) {
  const accountId = await getAccountId();
  if (!accountId) {
    throw new Error('Email account is not connected. Please connect Zoho Mail first.');
  }

  const maildata = await buildMaildataFromPayload(accountId, payload);
  console.log('[EmailCompose] Built maildata', maildata);

  if (payload.draftId) {
    return zohoApiRequest(`/accounts/${accountId}/drafts/${payload.draftId}/send`, {
      method: 'POST',
      body: JSON.stringify({ maildata }),
    });
  }

  return zohoApiRequest(`/accounts/${accountId}/messages`, {
    method: 'POST',
    body: JSON.stringify(maildata),
  });
}

// fetch all accounts for the current Zoho access token
export const fetchAccounts = async (): Promise<AccountsResponse> => {
  const accounts = await zohoApiRequest(`/accounts`);
  console.log("Fetched accounts:", accounts);
  if (accounts?.data.length > 0) {
    saveAccountId(accounts.data[0].accountId);
  }
  return accounts
};

/**
 * mark one or more messages read/unread using Zoho API
 */
export const updateMessages = async (
  accountId?: string,
  body?: UpdateMessageRequest
) => {
  // resolve accountId
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in electron-store");
  }

  if (!body) {
    throw new Error("Request body is required");
  }

  const url = `/accounts/${resolvedAccountId}/updatemessage`;
  return await zohoApiRequest(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });
};

/**
 * Search emails using Zoho search API
 */
export const searchEmails = async (
  accountId?: string,
  params?: SearchEmailParams
) => {
  // resolve accountId
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in electron-store");
  }

  const resolvedParams: SearchEmailParams = params || { searchKey: "" };
  const query = new URLSearchParams();
  if (resolvedParams.searchKey) query.append("searchKey", resolvedParams.searchKey);
  if (resolvedParams.receivedTime !== undefined) query.append("receivedTime", String(resolvedParams.receivedTime));
  if (resolvedParams.start !== undefined) query.append("start", String(resolvedParams.start));
  if (resolvedParams.limit !== undefined) query.append("limit", String(resolvedParams.limit));
  if (resolvedParams.includeto !== undefined) query.append("includeto", String(resolvedParams.includeto));

  const url = `/accounts/${resolvedAccountId}/messages/search?${query.toString()}`;
  const resp = await zohoApiRequest(url);

  if (resp && resp.data && Array.isArray(resp.data)) {
    resp.data = resp.data.map((e: any) => ({ ...e, accountId: resolvedAccountId }));
  }

  return resp;
};



// post an email object to our local server for storage
export const storeEmail = async (payload: StoreEmailPayload) => {
  // delegate to centralized server API helper which adds auth and base URL
  try {
    return await serverApiRequest("/store_email", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // normalize error message similar to previous implementation
    if (err instanceof Error) {
      throw new Error(`Failed to store email: ${err.message}`);
    }
    throw err;
  }
};
