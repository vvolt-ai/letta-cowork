import { useEffect, useRef, useCallback } from "react";
import type { ClientEvent, ZohoEmail } from "../types";

const PROCESSED_EMAILS_KEY_PREFIX = "auto_sync_processed_unread";
type AutoSyncRoutingRule = {
  fromPattern: string;
  agentId: string;
};

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
  selectedAgentIds: string[],
  routingRules: AutoSyncRoutingRule[],
  isEnabled: boolean = true,
  intervalMinutes: number = 5
) {
  const syncInProgressRef = useRef(false);
  const selectedAgentsRef = useRef<string[]>(selectedAgentIds);
  const routingRulesRef = useRef<AutoSyncRoutingRule[]>(routingRules);

  useEffect(() => {
    selectedAgentsRef.current = selectedAgentIds;
  }, [selectedAgentIds]);

  useEffect(() => {
    routingRulesRef.current = routingRules;
  }, [routingRules]);

  const getProcessedKey = useCallback(
    () => `${PROCESSED_EMAILS_KEY_PREFIX}_${accountId}_${folderId}`,
    [accountId, folderId]
  );

  const loadProcessedIds = useCallback((): Set<string> => {
    try {
      const raw = localStorage.getItem(getProcessedKey());
      if (!raw) return new Set<string>();
      const parsed = JSON.parse(raw) as string[];
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set(parsed.filter((id) => typeof id === "string" && id.length > 0));
    } catch {
      return new Set<string>();
    }
  }, [getProcessedKey]);

  const persistProcessedIds = useCallback((ids: Set<string>) => {
    localStorage.setItem(getProcessedKey(), JSON.stringify(Array.from(ids)));
  }, [getProcessedKey]);

  const uploadToAgent = useCallback(async (email: ZohoEmail, agentId: string): Promise<void> => {
    await window.electron.uploadEmailAttachmentToAgent(folderId, String(email.messageId), accountId, agentId);
  }, [accountId, folderId]);

  const performSync = useCallback(async () => {
    const selectedAgents = selectedAgentsRef.current;
    const rules = routingRulesRef.current;
    if (!accountId || !folderId || (selectedAgents.length === 0 && rules.length === 0) || syncInProgressRef.current) {
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

      const processedIds = loadProcessedIds();
      const unreadEmails = (resp.data as ZohoEmail[]).filter(
        (email) => !processedIds.has(String(email.messageId))
      );

      if (unreadEmails.length === 0) {
        console.log("[useAutoSyncUnread] No new unread emails to process.");
        return;
      }

      console.log(`[useAutoSyncUnread] Found ${unreadEmails.length} new unread emails`);

      const processedThisRun: string[] = [];
      for (const email of unreadEmails) {
        const senderText = String(email.fromAddress || email.sender || "").toLowerCase();
        const routedAgents = rules
          .filter((rule) => senderText.includes(rule.fromPattern.toLowerCase()))
          .map((rule) => rule.agentId);
        const targetAgents = Array.from(new Set(routedAgents.length > 0 ? routedAgents : selectedAgents));
        if (targetAgents.length === 0) continue;

        let allAgentsSucceeded = true;

        for (const agentId of targetAgents) {
          try {
            if (String(email.hasAttachment ?? "0") === "1") {
              await uploadToAgent(email, agentId);
            }

            const prompt = [
              "A new unread email arrived. Process it and provide next actions.",
              `Agent target: ${agentId}`,
              "Email payload:",
              JSON.stringify(email, null, 2),
              "If attachments were uploaded, inspect them with file tools and include findings.",
            ].join("\n\n");

            sendEvent({
              type: "session.start",
              payload: {
                title: `Auto Email: ${email.subject || email.messageId}`,
                prompt,
                cwd: "",
                agentId,
              },
            });
          } catch (error) {
            allAgentsSucceeded = false;
            console.error(
              `[useAutoSyncUnread] Failed to process message ${email.messageId} for agent ${agentId}:`,
              error
            );
          }
        }

        if (allAgentsSucceeded) {
          const messageId = String(email.messageId);
          processedIds.add(messageId);
          processedThisRun.push(messageId);
        }
      }

      if (processedThisRun.length > 0) {
        await window.electron.markMessagesAsRead(accountId, processedThisRun);
        persistProcessedIds(processedIds);
        console.log(`[useAutoSyncUnread] Processed and marked as read: ${processedThisRun.length} emails`);
      }
    } catch (err) {
      console.error("[useAutoSyncUnread] Sync failed:", err);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [accountId, folderId, loadProcessedIds, persistProcessedIds, sendEvent, uploadToAgent]);

  useEffect(() => {
    if (!isEnabled || !accountId || !folderId || (selectedAgentIds.length === 0 && routingRules.length === 0)) {
      return;
    }

    // Perform initial sync immediately
    performSync();

    // Set up interval for subsequent syncs
    const intervalMs = intervalMinutes * 60 * 1000;
    const intervalId = setInterval(performSync, intervalMs);

    return () => clearInterval(intervalId);
  }, [accountId, folderId, isEnabled, intervalMinutes, performSync, selectedAgentIds.length, routingRules.length]);
}
