/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, shell } from "electron";
import path from "path";
import fs from 'fs';
import { BASE_URL, getAccessToken, getAccountId, getInboxFolderId, saveAccountId, saveInboxFolderId } from "./helper.js";
import { serverApiRequest, zohoApiRequest } from "./zohoApi.js";
import type {
  AttachmentInfoResponse,
  AccountsResponse,
  EmailListParams,
  StoreEmailPayload,
  UpdateMessageRequest,
  SearchEmailParams,
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
  // use provided accountId or fetch from keytar
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in keytar");
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

export const fetchEmailById = async (accountId?: string, folderId?: string, messageId?: string) => {
  // resolve accountId from parameter or keytar
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in keytar");
  }

  // resolve folderId from parameter or keytar (inbox)
  const resolvedFolderId = folderId || (await getInboxFolderId());
  if (!resolvedFolderId) {
    throw new Error("No folder ID provided and none found in keytar");
  }

  if (!messageId) {
    throw new Error("Message ID is required");
  }

  // STEP 1: Fetch attachment metadata using common Zoho API helper
  const fetchEmailIdUrl = `/accounts/${resolvedAccountId}/folders/${resolvedFolderId}/messages/${messageId}/content`;
  return await zohoApiRequest(fetchEmailIdUrl);
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


export const downloadEmailAttachment = async (folderId?: string, messageId?: string, accountId?: string) => {
  // resolve accountId
  const resolvedAccountId = accountId || (await getAccountId());
  if (!resolvedAccountId) {
    throw new Error("No account ID provided and none found in keytar");
  }

  // resolve folderId
  const resolvedFolderId = folderId || (await getInboxFolderId());
  if (!resolvedFolderId) {
    throw new Error("No folder ID provided and none found in keytar");
  }

  if (!messageId) {
    throw new Error("Message ID is required");
  }

  const downloadDir = path.join(app.getPath('downloads'), 'ZohoAttachments', `${resolvedAccountId}_${resolvedFolderId}_${messageId}`);

  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  try {
    // STEP 1: Fetch attachment metadata using common Zoho API helper
    const infoUrl = `/accounts/${resolvedAccountId}/folders/${resolvedFolderId}/messages/${messageId}/attachmentinfo`;
    const infoData = await zohoApiRequest(infoUrl) as AttachmentInfoResponse;

    console.log("Attachment Info:", infoData); // Debug log
    if (!infoData.data || infoData.data.attachments.length === 0) {
      return { status: 'success', message: 'No attachments found.' };
    }

    // STEP 2: Download each attachment using direct fetch + Streams
    // (can't use zohoApiRequest here because we need the binary body stream)
    const accessToken = await getAccessToken();
    const downloadedFiles: string[] = [];

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
    }

    return { status: 'success', files: downloadedFiles, path: downloadDir };
  } catch (error) {
    console.error("Zoho Download Error:", error);
    throw error;
  }
};

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
    throw new Error("No account ID provided and none found in keytar");
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
    throw new Error("No account ID provided and none found in keytar");
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