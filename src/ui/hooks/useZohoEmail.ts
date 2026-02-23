import { useCallback, useEffect, useState } from "react";
import type { FolderResponse, ZohoEmailResponse, EmailListParams } from "../types";

/**
 * Helper hook to interact with Zoho Mail via the Electron APIs.
 *
 * Guarantees that `fetchAccounts` is called before any other request (it is
 * invoked automatically when the hook mounts).  The first account returned by
 * the API is selected and its `accountId` is stored; subsequent fetches for
 * folders/emails will throw if no account has been resolved yet.
 */
export function useZohoEmail() {
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [folders, setFolders] = useState<FolderResponse | null>(null);
  const [emails, setEmails] = useState<ZohoEmailResponse | null>(null);

  const fetchAccounts = useCallback(async () => {
    const resp = await window.electron.fetchAccounts();
    if (resp && resp.data) {
      setAccounts(resp.data);
      if (resp.data.length > 0) {
        setAccountId(resp.data[0].accountId);
      }
    }
    return resp;
  }, []);

  const fetchFolders = useCallback(async () => {
    if (!accountId) {
      throw new Error("Zoho accountId is required; call fetchAccounts first");
    }
    const resp: FolderResponse = await window.electron.fetchFolders();
    setFolders(resp);
    return resp;
  }, [accountId]);

  const fetchEmails = useCallback(
    async (folderId: string, params: Partial<EmailListParams> = {}) => {
      if (!accountId) {
        throw new Error("Zoho accountId is required; call fetchAccounts first");
      }

      // paginate through results until no more data
      const limit = params.limit ?? 100;
      
      // Retrieve last known start position from localStorage
      const storageKey = `zoho_email_last_start_${accountId}_${folderId}`;
      const lastStart = localStorage.getItem(storageKey);
      let start = params.start ?? (lastStart ? parseInt(lastStart, 10) : 0);
      
      const combined: ZohoEmailResponse = { status: { code: 0, description: "" }, data: [] };
      let keepGoing = true;

      while (keepGoing) {
        const resp: ZohoEmailResponse = await window.electron.fetchEmails(accountId, {
          folderId,
          ...params,
          start,
          limit,
        });

        if (resp?.data && resp.data.length > 0) {
          // attach accountId
          resp.data = resp.data.map(e => ({ ...e, accountId }));
          combined.data.push(...resp.data);
          combined.status = resp.status;
          setEmails(combined);

          // Update localStorage with current position
          localStorage.setItem(storageKey, String(start + resp.data.length));

          if (resp.data.length < limit) {
            keepGoing = false;
          } else {
            start += resp.data.length;
          }
        } else {
          keepGoing = false;
        }
      }

      return combined;
    },
    [accountId]
  );

  // automatically seed account info on mount
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const fetchEmailById = useCallback(
    async (folderId: string, messageId: string) => {
      if (!accountId) {
        throw new Error("Zoho accountId is required; call fetchAccounts first");
      }
      return await window.electron.fetchEmailById(accountId, folderId, messageId);
    },
    [accountId]
  );

  const markMessagesAsRead = useCallback(
    async (messageIds: (number | string)[]) => {
      if (!accountId) {
        throw new Error("Zoho accountId is required");
      }
      return await window.electron.markMessagesAsRead(accountId, messageIds);
    },
    [accountId]
  );

  // Reset pagination for a specific folder
  const resetEmailsPosition = useCallback(
    (folderId: string) => {
      const storageKey = `zoho_email_last_start_${accountId}_${folderId}`;
      localStorage.removeItem(storageKey);
      setEmails(null);
    },
    [accountId]
  );

  // Search emails using Zoho search API
  const searchForEmails = useCallback(
    async (searchKey: string, params: any = {}) => {
      if (!accountId) {
        throw new Error("Zoho accountId is required");
      }
      return await window.electron.searchEmails(accountId, {
        searchKey,
        ...params,
      });
    },
    [accountId]
  );

  return {
    accountId,
    accounts,
    folders,
    emails,
    fetchAccounts,
    fetchFolders,
    fetchEmails,
    fetchEmailById,
    markMessagesAsRead,
    resetEmailsPosition,
    searchForEmails,
  };
}
