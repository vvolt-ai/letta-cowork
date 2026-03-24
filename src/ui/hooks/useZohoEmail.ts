import { useCallback, useEffect, useState } from "react";
import type { FolderResponse, ZohoEmailResponse, EmailListParams } from "../types";

const DEFAULT_FOLDER_ID = "2467477000000008014";
const EMAIL_PAGE_SIZE = 100;

/**
 * Helper hook to interact with Zoho Mail via the Electron APIs.
 *
 * Guarantees that `fetchAccounts` is called before any other request (it is
 * invoked automatically when the hook mounts).  The first account returned by
 * the API is selected and its `accountId` is stored; subsequent fetches for
 * folders/emails will throw if no account has been resolved yet.
 *
 * Supports lazy pagination - fetch emails in pages of 100 on demand.
 */
export function useZohoEmail() {
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [folders, setFolders] = useState<FolderResponse | null>(null);
  const [emails, setEmails] = useState<ZohoEmailResponse | null>(null);
  const [isMailConnected, setIsMailConnected] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [isFetchingEmailContent, setIsFetchingEmailContent] = useState(false);

  // Pagination state for lazy loading
  const [nextEmailStart, setNextEmailStart] = useState(0);
  const [hasMoreEmails, setHasMoreEmails] = useState(true);
  const [isLoadingMoreEmails, setIsLoadingMoreEmails] = useState(false);

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

      setIsFetchingEmailContent(true);
      setHasMoreEmails(true);
      setNextEmailStart(0);

      const limit = params.limit ?? EMAIL_PAGE_SIZE;
      const start = params.start ?? 0;

      try {
        const resp: ZohoEmailResponse = await window.electron.fetchEmails(accountId, {
          folderId,
          ...params,
          start,
          limit,
        });

        if (resp?.data && resp.data.length > 0) {
          // attach accountId
          resp.data = resp.data.map(e => ({ ...e, accountId }));
          setEmails(resp);
          setNextEmailStart(start + resp.data.length);
          setHasMoreEmails(resp.data.length >= limit);
        } else {
          setEmails({ status: { code: 0, description: "" }, data: [] });
          setHasMoreEmails(false);
        }

        return resp;
      } finally {
        setIsFetchingEmailContent(false);
      }
    },
    [accountId]
  );

  // Fetch the next page of emails (lazy loading)
  const fetchMoreEmails = useCallback(
    async (folderId: string) => {
      if (!accountId) {
        throw new Error("Zoho accountId is required; call fetchAccounts first");
      }
      if (isLoadingMoreEmails || !hasMoreEmails) {
        return null;
      }

      setIsLoadingMoreEmails(true);

      try {
        const resp: ZohoEmailResponse = await window.electron.fetchEmails(accountId, {
          folderId,
          start: nextEmailStart,
          limit: EMAIL_PAGE_SIZE,
        });

        if (resp?.data && resp.data.length > 0) {
          // attach accountId
          resp.data = resp.data.map(e => ({ ...e, accountId }));

          // Append to existing emails
          setEmails((prev) => {
            if (!prev) return resp;
            return {
              status: resp.status,
              data: [...prev.data, ...resp.data],
            };
          });

          setNextEmailStart((prev) => prev + resp.data.length);
          setHasMoreEmails(resp.data.length >= EMAIL_PAGE_SIZE);
        } else {
          setHasMoreEmails(false);
        }

        return resp;
      } finally {
        setIsLoadingMoreEmails(false);
      }
    },
    [accountId, nextEmailStart, hasMoreEmails, isLoadingMoreEmails]
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
    (_folderId: string) => {
      setEmails(null);
      setNextEmailStart(0);
      setHasMoreEmails(true);
      setIsLoadingMoreEmails(false);
    },
    []
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
    fetchMoreEmails,
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
    // Pagination state
    hasMoreEmails,
    isLoadingMoreEmails,
  };
}
