import { useEffect, useRef, useCallback } from "react";
import { ClientEvent } from "../types";

/**
 * Hook that runs a background job to fetch unread emails every 5 minutes
 * and automatically mark them as read.
 *
 * Usage:
 *   useAutoSyncUnread(accountId, folderId, isEnabled);
 *
 * The job:
 * 1. Fetches all unread emails from the specified folder using fetchEmails with status: "unread"
 * 2. Extracts message IDs
 * 3. Marks them all as read via Zoho API
 * 4. Logs results to console
 */
export function useAutoSyncUnread(
  sendEvent: (event: ClientEvent) => void,
  accountId: string,
  folderId: string,
  isEnabled: boolean = true,
  intervalMinutes: number = 5
) {
  const syncInProgressRef = useRef(false);

  const performSync = useCallback(async () => {
    if (!accountId || !folderId || syncInProgressRef.current) {
      return;
    }

    syncInProgressRef.current = true;

    try {
      console.log(`[useAutoSyncUnread] Starting sync for account ${accountId}, folder ${folderId}`);

      // Step 1: Fetch unread emails using standard fetchEmails with status filter
      const resp = await window.electron.fetchEmails(accountId, {
        folderId,
        status: "unread",
        limit: 100,
      });

      if (!resp?.data || resp.data.length === 0) {
        console.log("[useAutoSyncUnread] No unread emails found.");
        return;
      }

      console.log(`[useAutoSyncUnread] Found ${resp.data.length} unread emails`);

      // Step 2: Extract message IDs
      // const messageIds = resp.data.map((email: any) => email.messageId);

      // Step 3: Mark as read
      // const result = await window.electron.markMessagesAsRead(accountId, messageIds);

      const prompt = `Please analyze the following email conversation and summarize the key points:\n\n ${JSON.stringify(resp.data, null, 2)}`;

     sendEvent({ type: "session.continue", payload: { sessionId: "conv-d57ed528-26e9-4807-9e1e-7da0090184b9", prompt, cwd: ''  } });

      //console.log(`[useAutoSyncUnread] Marked emails as read`);
    } catch (err) {
      console.error("[useAutoSyncUnread] Sync failed:", err);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [accountId, folderId]);

  useEffect(() => {
    if (!isEnabled || !accountId || !folderId) {
      return;
    }

    // Perform initial sync immediately
    performSync();

    // Set up interval for subsequent syncs
    const intervalMs = intervalMinutes * 60 * 1000;
    const intervalId = setInterval(performSync, intervalMs);

    return () => clearInterval(intervalId);
  }, [accountId, folderId, isEnabled, intervalMinutes, performSync]);
}
