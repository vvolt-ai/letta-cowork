import { useEffect, useRef, useCallback } from "react";
import type { ClientEvent, ZohoEmail, UploadedEmailAttachment, ChatAttachment, SessionStatus } from "../types";
import { useAppStore } from "../store/useAppStore";

const PROCESSED_EMAILS_KEY_PREFIX = "auto_sync_processed_unread";
const AUTO_SYNC_SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const AUTO_SYNC_STATUS_POLL_MS = 500;

type AutoSyncRoutingRule = {
  fromPattern: string;
  agentId: string;
};

const escapeMd = (value: unknown): string => {
  const text = String(value ?? "");
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br/>")
    .trim();
};

const toCodeBlock = (content: string, language = ""): string => {
  if (!content.trim()) return "_No content available._";
  const fence = "```";
  return `${fence}${language}\n${content}\n${fence}`;
};

const formatBytes = (size: number): string => {
  if (!Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const attachmentLine = (attachment: UploadedEmailAttachment): string => {
  const sizeLabel = formatBytes(attachment.size);
  const descriptor = [attachment.mimeType, sizeLabel]
    .filter(Boolean)
    .join(" · ");
  return `- [${escapeMd(attachment.fileName)}](${attachment.url})${descriptor ? ` (${descriptor})` : ""}`;
};

const toChatAttachment = (attachment: UploadedEmailAttachment): ChatAttachment => ({
  id: attachment.fileId,
  name: attachment.fileName,
  mimeType: attachment.mimeType,
  size: attachment.size,
  url: attachment.url,
  kind: attachment.kind,
  previewUrl: attachment.kind === "image" ? attachment.url : undefined,
});

const extractEmailContent = (details: unknown): string => {
  if (!details || typeof details !== "object") return "";
  const data = (details as { data?: Record<string, unknown> }).data ?? (details as Record<string, unknown>);
  const content = data?.content ?? data?.htmlContent ?? data?.message ?? data?.summary ?? "";
  return typeof content === "string" ? content.trim() : "";
};

const buildEmailMarkdownPrompt = (email: ZohoEmail, agentId: string, emailContent: string, hasAttachment: boolean): string => {
  const metadataTable = [
    "| Field | Value |",
    "| --- | --- |",
    `| Subject | ${escapeMd(email.subject || "(No subject)")} |`,
    `| From | ${escapeMd(email.sender || email.fromAddress || "Unknown sender")} |`,
    `| To | ${escapeMd(email.toAddress || "N/A")} |`,
    `| CC | ${escapeMd(email.ccAddress || "N/A")} |`,
    `| Message ID | ${escapeMd(email.messageId)} |`,
    `| Folder ID | ${escapeMd(email.folderId)} |`,
    `| Received Time | ${escapeMd(email.receivedTime || "N/A")} |`,
    `| Sent Time (GMT) | ${escapeMd(email.sentDateInGMT || "N/A")} |`,
    `| Size | ${escapeMd(email.size || "N/A")} |`,
    `| Has Attachment | ${hasAttachment ? "Yes" : "No"} |`,
    `| Priority | ${escapeMd(email.priority || "N/A")} |`,
    `| Status | ${escapeMd(email.status || "N/A")} |`,
    `| Status2 | ${escapeMd(email.status2 || "N/A")} |`,
  ].join("\n");

  const allFieldsTable = [
    "| Key | Value |",
    "| --- | --- |",
    ...Object.entries(email).map(([key, value]) => `| ${escapeMd(key)} | ${escapeMd(value)} |`),
  ].join("\n");

  return [
    "# Unread Email Intake",
    "A new unread email arrived. Analyze it and provide clear next actions.",
    `## Target Agent\n\`${escapeMd(agentId)}\``,
    "## Email Metadata",
    metadataTable,
    "## Email Summary",
    email.summary?.trim() ? email.summary : "_No summary provided._",
    "## Email Full Content",
    toCodeBlock(emailContent || email.summary || "", "text"),
    "## Email Raw Fields",
    allFieldsTable,
    "## Attachments",
    hasAttachment
      ? "Attachments were uploaded to the agent folder. Inspect them with file tools and include findings."
      : "No attachments reported for this email.",
  ].join("\n\n");
};

interface EmailWithAttachments {
  emailContent: Record<string, unknown>;
  attachments: {
    files: UploadedEmailAttachment[];
    uploadErrors: { file: string; error: string }[];
  } | null;
}

const buildAttachmentsSection = (
  hasAttachment: boolean,
  attachments: UploadedEmailAttachment[]
): string => {
  if (!hasAttachment) return "No attachments reported for this email.";
  if (attachments.length === 0) {
    return "Attachments exist and were uploaded, but file metadata could not be resolved. Inspect the linked files.";
  }

  return [
    "### Files",
    ...attachments.map((attachment) => attachmentLine(attachment)),
  ].join("\n");
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const sanitizeTitleFragment = (value: unknown): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 80);

const buildAutoSyncSessionTitle = (email: ZohoEmail, agentId: string): string => {
  const subject = sanitizeTitleFragment(email.subject || email.summary || "") || "No subject";
  const messageId = sanitizeTitleFragment(email.messageId);
  const agentFragment = sanitizeTitleFragment(agentId);
  return `Auto Email: ${subject} [msg:${messageId}][agent:${agentFragment}][ts:${Date.now()}]`;
};

const findSessionByTitleAndAgent = (title: string, agentId: string) => {
  const sessions = useAppStore.getState().sessions;
  return Object.values(sessions).find(
    (session) => session.title === title && (session.agentId ?? "") === agentId
  );
};

const waitForAutoSyncSessionResult = async (
  title: string,
  agentId: string,
  timeoutMs: number = AUTO_SYNC_SESSION_TIMEOUT_MS
): Promise<{ success: boolean; sessionId?: string; status?: SessionStatus; reason?: string }> => {
  const startedAt = Date.now();
  let sessionId: string | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    if (!sessionId) {
      const matchingSession = findSessionByTitleAndAgent(title, agentId);
      if (matchingSession) {
        sessionId = matchingSession.id;
        if (matchingSession.status === "completed") {
          return { success: true, sessionId, status: matchingSession.status };
        }
        if (matchingSession.status === "error") {
          return {
            success: false,
            sessionId,
            status: matchingSession.status,
            reason: "Auto-sync session ended with an error before completion.",
          };
        }
      }
    }

    if (sessionId) {
      const session = useAppStore.getState().sessions[sessionId];
      if (!session) {
        return {
          success: false,
          sessionId,
          reason: "Auto-sync session disappeared before completion.",
        };
      }
      if (session.status === "completed") {
        return { success: true, sessionId, status: session.status };
      }
      if (session.status === "error") {
        return {
          success: false,
          sessionId,
          status: session.status,
          reason: "Auto-sync session completed with an error.",
        };
      }
    }

    await sleep(AUTO_SYNC_STATUS_POLL_MS);
  }

  return {
    success: false,
    sessionId,
    status: sessionId ? useAppStore.getState().sessions[sessionId]?.status : undefined,
    reason: sessionId
      ? "Timed out waiting for the auto-sync session to finish successfully."
      : "Timed out waiting for the auto-sync session to start.",
  };
};

/**
 * Hook that polls unread Zoho emails on an interval and routes them into Letta sessions.
 *
 * Current behavior:
 * 1. Fetch unread emails from the selected folder
 * 2. Skip emails already processed locally or older than the configured since-date
 * 3. Route each email to matched or selected agents
 * 4. Fetch full content and upload attachments before dispatch
 * 5. Start a new Letta session for each email/agent pair
 * 6. Mark the email as read only after every routed session completes successfully
 */
export function useAutoSyncUnread(
  sendEvent: (event: ClientEvent) => void,
  accountId: string,
  folderId: string,
  selectedAgentIds: string[],
  routingRules: AutoSyncRoutingRule[],
  isEnabled: boolean = true,
  intervalMinutes: number = 5,
  sinceDate: string = "",
  processingMode: AutoSyncProcessingMode = "unread_only"
) {
  const syncInProgressRef = useRef(false);
  const selectedAgentsRef = useRef<string[]>(selectedAgentIds);
  const routingRulesRef = useRef<AutoSyncRoutingRule[]>(routingRules);
  const sinceDateRef = useRef<string>(sinceDate);
  const processingModeRef = useRef<AutoSyncProcessingMode>(processingMode);

  useEffect(() => {
    selectedAgentsRef.current = selectedAgentIds;
  }, [selectedAgentIds]);

  useEffect(() => {
    routingRulesRef.current = routingRules;
  }, [routingRules]);

  useEffect(() => {
    sinceDateRef.current = sinceDate;
  }, [sinceDate]);

  useEffect(() => {
    processingModeRef.current = processingMode;
  }, [processingMode]);

  const getProcessedKey = useCallback(
    () => `${PROCESSED_EMAILS_KEY_PREFIX}_${accountId}_${folderId}`,
    [accountId, folderId]
  );

  const loadLegacyProcessedIds = useCallback((): Set<string> => {
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

  const clearLegacyProcessedIds = useCallback(() => {
    try {
      localStorage.removeItem(getProcessedKey());
    } catch {
      // Ignore migration cleanup issues.
    }
  }, [getProcessedKey]);

  const persistProcessedIds = useCallback(async (ids: Set<string>) => {
    const nextIds = Array.from(ids);
    try {
      await window.electron.setProcessedUnreadEmailIds(accountId, folderId, nextIds);
      clearLegacyProcessedIds();
    } catch (error) {
      console.warn("[useAutoSyncUnread] Failed to persist processed unread IDs to electron-store:", error);
      localStorage.setItem(getProcessedKey(), JSON.stringify(nextIds));
    }
  }, [accountId, clearLegacyProcessedIds, folderId, getProcessedKey]);

  const loadProcessedIds = useCallback(async (): Promise<Set<string>> => {
    const legacyIds = loadLegacyProcessedIds();

    try {
      const storedIds = await window.electron.getProcessedUnreadEmailIds(accountId, folderId);
      const mergedIds = new Set(
        storedIds.filter((id) => typeof id === "string" && id.length > 0)
      );

      let migratedLegacyIds = false;
      for (const id of legacyIds) {
        if (!mergedIds.has(id)) {
          mergedIds.add(id);
          migratedLegacyIds = true;
        }
      }

      if (migratedLegacyIds) {
        await window.electron.setProcessedUnreadEmailIds(accountId, folderId, Array.from(mergedIds));
      }

      if (legacyIds.size > 0) {
        clearLegacyProcessedIds();
      }

      return mergedIds;
    } catch (error) {
      console.warn("[useAutoSyncUnread] Failed to load processed unread IDs from electron-store:", error);
      return legacyIds;
    }
  }, [accountId, clearLegacyProcessedIds, folderId, loadLegacyProcessedIds]);

  const performSync = useCallback(async () => {
    const selectedAgents = selectedAgentsRef.current;
    const rules = routingRulesRef.current;
    if (!accountId || !folderId || (selectedAgents.length === 0 && rules.length === 0) || syncInProgressRef.current) {
      return;
    }

    syncInProgressRef.current = true;

    try {
      console.log(`[useAutoSyncUnread] Starting sync for account ${accountId}, folder ${folderId}`);

      const mode = processingModeRef.current;
      const resp = await window.electron.fetchEmails(accountId, {
        folderId,
        status: mode === "today_all" ? "all" : "unread",
        limit: 100,
      });

      if (!resp?.data || resp.data.length === 0) {
        console.log("[useAutoSyncUnread] No unread emails found.");
        return;
      }

      const processedIds = await loadProcessedIds();
      const sinceMs = sinceDateRef.current
        ? new Date(sinceDateRef.current).getTime()
        : 0;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartMs = todayStart.getTime();
      const activeMode = processingModeRef.current;

      const candidateEmails = (resp.data as ZohoEmail[]).filter((email) => {
        if (processedIds.has(String(email.messageId))) return false;

        const emailMs = Number(email.receivedTime);
        if (activeMode === "today_all") {
          if (Number.isNaN(emailMs) || emailMs < todayStartMs) return false;
        }

        if (sinceMs > 0) {
          if (!Number.isNaN(emailMs) && emailMs < sinceMs) return false;
        }
        return true;
      });

      if (candidateEmails.length === 0) {
        console.log(`[useAutoSyncUnread] No new emails to process for mode ${activeMode}.`);
        return;
      }

      console.log(`[useAutoSyncUnread] Found ${candidateEmails.length} emails to process for mode ${activeMode}`);

      const processedThisRun: string[] = [];
      for (const email of candidateEmails) {
        const senderText = String(email.fromAddress || email.sender || "").toLowerCase();
        const routedAgents = rules
          .filter((rule) => senderText.includes(rule.fromPattern.toLowerCase()))
          .map((rule) => rule.agentId);
        const targetAgents = Array.from(new Set(routedAgents.length > 0 ? routedAgents : selectedAgents));
        if (targetAgents.length === 0) continue;

        let allAgentsSucceeded = true;

        for (const agentId of targetAgents) {
          try {
            const hasAttachment = String(email.hasAttachment ?? "0") === "1";
            let uploadedAttachments: UploadedEmailAttachment[] = [];
            let uploadErrors: { file: string; error: string }[] = [];
            let emailContent = "";

            try {
              const emailWithAttachments = await window.electron.fetchEmailById(
                accountId,
                email.folderId,
                String(email.messageId)
              ) as EmailWithAttachments;

              if (emailWithAttachments?.emailContent) {
                emailContent = extractEmailContent(emailWithAttachments.emailContent);
              }

              if (emailWithAttachments?.attachments) {
                uploadedAttachments = emailWithAttachments.attachments.files ?? [];
                uploadErrors = emailWithAttachments.attachments.uploadErrors ?? [];
              }
            } catch (detailError) {
              console.warn(
                `[useAutoSyncUnread] Failed to fetch full content for message ${email.messageId}:`,
                detailError
              );
            }

            const effectiveHasAttachment = hasAttachment || uploadedAttachments.length > 0;
            const promptSections = [
              buildEmailMarkdownPrompt(email, agentId, emailContent, effectiveHasAttachment),
              "## Attachment Files",
              buildAttachmentsSection(effectiveHasAttachment, uploadedAttachments),
            ];

            if (uploadErrors.length > 0) {
              promptSections.push(
                "## Attachment Upload Warnings",
                uploadErrors
                  .map((error) => `- ${escapeMd(error.file)}: ${escapeMd(error.error)}`)
                  .join("\n")
              );
            }

            const prompt = promptSections.join("\n\n");
            const chatAttachments: ChatAttachment[] = uploadedAttachments.map(toChatAttachment);
            const sessionTitle = buildAutoSyncSessionTitle(email, agentId);

            sendEvent({
              type: "session.start",
              payload: {
                title: sessionTitle,
                prompt,
                attachments: chatAttachments,
                cwd: "",
                agentId,
              },
            });

            const sessionResult = await waitForAutoSyncSessionResult(sessionTitle, agentId);
            if (!sessionResult.success) {
              allAgentsSucceeded = false;
              console.warn(
                `[useAutoSyncUnread] Session for message ${email.messageId} and agent ${agentId} did not complete successfully: ${sessionResult.reason ?? sessionResult.status ?? "unknown failure"}`
              );
              break;
            }
          } catch (error) {
            allAgentsSucceeded = false;
            console.error(
              `[useAutoSyncUnread] Failed to process message ${email.messageId} for agent ${agentId}:`,
              error
            );
            break;
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
        await persistProcessedIds(processedIds);
        console.log(`[useAutoSyncUnread] Processed and marked as read: ${processedThisRun.length} emails`);
      }
    } catch (err) {
      console.error("[useAutoSyncUnread] Sync failed:", err);
    } finally {
      syncInProgressRef.current = false;
    }
  }, [accountId, folderId, loadProcessedIds, persistProcessedIds, sendEvent]);

  const runAutoSyncNow = useCallback(async () => {
    await performSync();
  }, [performSync]);

  useEffect(() => {
    if (!isEnabled || !accountId || !folderId || (selectedAgentIds.length === 0 && routingRules.length === 0)) {
      return;
    }

    performSync();

    const intervalMs = intervalMinutes * 60 * 1000;
    const intervalId = setInterval(performSync, intervalMs);

    return () => clearInterval(intervalId);
  }, [accountId, folderId, isEnabled, intervalMinutes, performSync, selectedAgentIds.length, routingRules.length]);

  return {
    runAutoSyncNow,
  };
}
