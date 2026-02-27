import { useCallback, useEffect, useState } from "react";
import type { FolderResponse, ZohoEmailResponse, EmailListParams } from "../types";

const DEFAULT_FOLDER_ID = "2467477000000008014";

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
  const [isMailConnected, setIsMailConnected] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [isFetchingEmailContent, setIsFetchingEmailContent] = useState(false);

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
      console.log("Fetching emails for folder", folderId, "with params", params);
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
  // useEffect(() => {
  //   fetchAccounts();
  // }, [fetchAccounts]);

  const fetchEmailById = useCallback(
    async (folderId: string, messageId: string, accountIdOverride?: string) => {
      const targetAccountId = accountIdOverride || accountId;
      if (!targetAccountId) {
        throw new Error("Zoho accountId is required; call fetchAccounts first");
      }
      return await window.electron.fetchEmailById(targetAccountId, folderId, messageId);
    },
    [accountId]
  );

  const markMessagesAsRead = useCallback(
    async (messageIds: (number | string)[], accountIdOverride?: string) => {
      const targetAccountId = accountIdOverride || accountId;
      if (!targetAccountId) {
        throw new Error("Zoho accountId is required");
      }
      return await window.electron.markMessagesAsRead(targetAccountId, messageIds);
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

  const checkAlreadyConnected = useCallback(async () => {
    try {
      const alreadyConnected = await window.electron.checkAlreadyConnected();
      setIsMailConnected(alreadyConnected);
      console.log("Is email already connected?", alreadyConnected);
      return alreadyConnected;
    } catch (error) {
      console.error("Failed to check email connection:", error);
      return false;
    }
  }, []);

  const loadInboxFolder = useCallback(async () => {
    setIsFetchingEmailContent(true);
    try {
      const data = await fetchFolders();
      const inboxFolder = data?.folders?.find((f: any) => f.folderName === "Inbox");
      const resolvedFolderId = inboxFolder ? String(inboxFolder.folderId) : DEFAULT_FOLDER_ID;
      setFolderId(resolvedFolderId);
      return resolvedFolderId;
    } catch (err) {
      console.error("Failed to load folders/emails:", err);
      return DEFAULT_FOLDER_ID;
    } finally {
      setIsFetchingEmailContent(false);
    }
  }, [fetchFolders]);

  const refetchEmails = useCallback(async () => {
    const targetFolderId = folderId || DEFAULT_FOLDER_ID;
    resetEmailsPosition(targetFolderId);
    return fetchEmails(targetFolderId);
  }, [fetchEmails, folderId, resetEmailsPosition]);

  const refreshEmailsForFolder = useCallback(async (targetFolderId: string) => {
    resetEmailsPosition(targetFolderId);
    return fetchEmails(targetFolderId, { start: 0 });
  }, [fetchEmails, resetEmailsPosition]);

  const connectEmail = useCallback(async () => {
    try {
      await window.electron.connectEmail();
    } catch (error) {
      console.error("Email connect error:", error);
      alert("Unable to start email connection.");
    }
  }, []);

  const disconnectEmail = useCallback(async () => {
    try {
      await window.electron.disconnectEmail();
      setIsMailConnected(false);
      setAccountId("");
      setAccounts([]);
      setFolders(null);
      setEmails(null);
      setFolderId("");
      setIsFetchingEmailContent(false);
    } catch (error) {
      console.error("Email disconnect error:", error);
      throw error;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeEmailCheck = async () => {
      if (isMounted) {
        await checkAlreadyConnected();
      }
    };

    initializeEmailCheck();

    const unsubscribe = window.electron.onEmailConnected((data) => {
      if (data.success && isMounted) {
        console.log("Email connected. Fetching folders...");
        checkAlreadyConnected();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [checkAlreadyConnected]);

  useEffect(() => {
    if (!isMailConnected) return;
    fetchAccounts().catch((err) => {
      checkAlreadyConnected();
      console.error("Failed to fetch accounts after connection:", err);
    });
  }, [checkAlreadyConnected, fetchAccounts, isMailConnected]);

  useEffect(() => {
    if (!accountId || !isMailConnected) return;
    void loadInboxFolder();
  }, [accountId, isMailConnected, loadInboxFolder]);

  useEffect(() => {
    if (!isMailConnected || !folderId) return;
    console.log("Folder ID or connection status changed. Folder ID:", folderId, "Is Mail Connected?", isMailConnected);
    fetchEmails(folderId);
  }, [fetchEmails, folderId, isMailConnected]);

  return {
    accountId,
    accounts,
    folders,
    emails,
    isMailConnected,
    folderId,
    isFetchingEmailContent,
    fetchAccounts,
    fetchFolders,
    fetchEmails,
    fetchEmailById,
    markMessagesAsRead,
    resetEmailsPosition,
    searchForEmails,
    checkAlreadyConnected,
    loadInboxFolder,
    refetchEmails,
    refreshEmailsForFolder,
    connectEmail,
    disconnectEmail,
  };
}
