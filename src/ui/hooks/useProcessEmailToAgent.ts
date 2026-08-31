import { useCallback, useState, useRef, useEffect } from "react";

const AWAITING_CONVERSATION_TIMEOUT_MS = 15000;
import type { ZohoEmail, UploadedEmailAttachment, ChatAttachment } from "../types";
import {
  emailIdentityKey,
  emailIdentityKeyFromParts,
  emailSessionMarker,
} from "../features/email/emailIdentity";

type PendingEmailSession = {
  accountId: string;
  folderId: string;
  messageId: string;
  emailKey: string;
  agentId: string;
  sessionTitle: string;
};

interface EmailWithAttachments {
  emailContent: Record<string, unknown>;
  attachments: {
    files: UploadedEmailAttachment[];
    uploadErrors: { file: string; error: string }[];
  } | null;
}

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
  const parts = [attachment.mimeType, sizeLabel]
    .filter(Boolean)
    .join(" · ");
  return `- [${escapeMd(attachment.fileName)}](${attachment.url})${parts ? ` (${parts})` : ""}`;
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
    "# Email Processing Request",
    "Please analyze and process this email:",
    `## Target Agent\n\`${escapeMd(agentId)}\``,
    "## Email Metadata",
    metadataTable,
    "## Email Summary",
    email.summary?.trim() ? email.summary : "_No summary provided._",
    "## Email Full Content",
    toCodeBlock(emailContent || email.summary || "", "text"),
    "## Email Raw Fields",
    allFieldsTable,
  ].join("\n\n");
};

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

const sanitizeTitleFragment = (value: unknown): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 80);

const buildManualEmailSessionTitle = (email: ZohoEmail, agentId: string): string => {
  const subject = sanitizeTitleFragment(email.subject || email.summary || "") || "No subject";
  const agentFragment = sanitizeTitleFragment(agentId);
  return `Email: ${subject} ${emailSessionMarker(email)}[agent:${agentFragment}][ts:${Date.now()}]`;
};

/**
 * Hook to process an email and send it to an agent session
 * Similar to auto-sync but triggered manually
 */
export function useProcessEmailToAgent(onConversationCreated?: (emailKey: string, conversationId: string, agentId?: string) => void) {
  // Processing: API call in progress (fetching content, uploading attachments, sending to agent)
  const [processingEmailId, setProcessingEmailId] = useState<string | null>(null);
  // AwaitingConversation: Email sent to agent, waiting for conversationId from session.status event
  const [awaitingConversationEmailId, setAwaitingConversationEmailId] = useState<string | null>(null);
  // Error state for failed processing
  const [errorEmailId, setErrorEmailId] = useState<string | null>(null);
  
  const pendingEmailByTitleRef = useRef<Map<string, PendingEmailSession>>(new Map());
  const awaitingTimeoutByTitleRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onConversationCreatedRef = useRef(onConversationCreated);

  // Keep callback ref updated
  useEffect(() => {
    onConversationCreatedRef.current = onConversationCreated;
  }, [onConversationCreated]);

  const clearAwaitingTimeout = useCallback((sessionTitle?: string) => {
    if (sessionTitle) {
      const timeout = awaitingTimeoutByTitleRef.current.get(sessionTitle);
      if (timeout) clearTimeout(timeout);
      awaitingTimeoutByTitleRef.current.delete(sessionTitle);
      return;
    }

    for (const timeout of awaitingTimeoutByTitleRef.current.values()) {
      clearTimeout(timeout);
    }
    awaitingTimeoutByTitleRef.current.clear();
  }, []);

  const beginAwaitingConversation = useCallback((pending: PendingEmailSession) => {
    setAwaitingConversationEmailId(pending.emailKey);
    clearAwaitingTimeout(pending.sessionTitle);
    const timeout = setTimeout(() => {
      setAwaitingConversationEmailId(prev => prev === pending.emailKey ? null : prev);
      setErrorEmailId(prev => prev ?? pending.emailKey);
      pendingEmailByTitleRef.current.delete(pending.sessionTitle);
      awaitingTimeoutByTitleRef.current.delete(pending.sessionTitle);
      console.warn(`[useProcessEmailToAgent] Timed out waiting for conversation link for email ${pending.messageId}`);
    }, AWAITING_CONVERSATION_TIMEOUT_MS);
    awaitingTimeoutByTitleRef.current.set(pending.sessionTitle, timeout);
  }, [clearAwaitingTimeout]);

  useEffect(() => {
    return () => {
      clearAwaitingTimeout();
      pendingEmailByTitleRef.current.clear();
    };
  }, [clearAwaitingTimeout]);

  // Listen for session.status events to update processed email records with conversation ID
  useEffect(() => {
    const unsubscribe = window.electron?.onServerEvent?.(async (event: any) => {
      console.log(`[useProcessEmailToAgent] Received event:`, event.type, event.payload);

      if (event.type === "session.status") {
        console.log(`[useProcessEmailToAgent] session.status payload:`, {
          isEmailSession: event.payload?.isEmailSession,
          status: event.payload?.status,
          sessionId: event.payload?.sessionId,
          pendingEmailCount: pendingEmailByTitleRef.current.size,
          title: event.payload?.title,
        });
      }

      if (event.type === "session.status" && event.payload?.isEmailSession && event.payload?.status === "running") {
        const conversationId = event.payload.sessionId;
        const agentId = event.payload.agentId;
        const sessionTitle = typeof event.payload.title === "string" ? event.payload.title : "";
        // Never guess which email owns a session event. A missing or changed
        // title must remain unlinked rather than attaching an older conversation
        // to whichever email happens to be the only pending item.
        const emailInfo = pendingEmailByTitleRef.current.get(sessionTitle) ?? null;

        console.log(`[useProcessEmailToAgent] Matched! conversationId: ${conversationId}, title: ${sessionTitle}, emailInfo:`, emailInfo);

        if (emailInfo && conversationId) {
          console.log(`[useProcessEmailToAgent] Session created: ${conversationId} for email ${emailInfo.messageId}`);

          // Update processed email record with conversation ID via IPC
          try {
            await window.electron.updateEmailConversationId(
              emailInfo.accountId,
              emailInfo.folderId,
              emailInfo.messageId,
              conversationId,
              agentId || emailInfo.agentId
            );
            console.log(`[useProcessEmailToAgent] Updated conversation ID ${conversationId} for email ${emailInfo.messageId}`);

            // Clear the awaiting state since we now have the conversationId
            clearAwaitingTimeout(emailInfo.sessionTitle);
            pendingEmailByTitleRef.current.delete(emailInfo.sessionTitle);
            setAwaitingConversationEmailId(prev => prev === emailInfo.emailKey ? null : prev);
            setErrorEmailId(prev => prev === emailInfo.emailKey ? null : prev);

            // Notify callback that conversation was created
            if (onConversationCreatedRef.current) {
              onConversationCreatedRef.current(emailInfo.emailKey, conversationId, agentId || emailInfo.agentId);
            }
          } catch (err) {
            console.warn(`[useProcessEmailToAgent] Error updating conversation ID:`, err);
            // Keep in awaiting state on error - the callback will handle showing error
          }
        } else {
          console.warn(`[useProcessEmailToAgent] Missing emailInfo or conversationId`, { emailInfo, conversationId });
        }
      }
    }) ?? (() => {});
    return unsubscribe;
  }, [clearAwaitingTimeout]);
  
  const processEmailToAgent = useCallback(async (email: ZohoEmail, agentId: string, additionalInstructions?: string) => {
    const messageId = String(email.messageId);
    const emailKey = emailIdentityKey(email);
    setProcessingEmailId(emailKey);
    setErrorEmailId(null);
    
    let shouldAwaitConversation = false;
    let pendingSession: PendingEmailSession | null = null;

    try {
      const accountId = email.accountId;
      const folderId = email.folderId;
      const messageId = String(email.messageId);

      if (!accountId || !folderId) {
        console.error("Missing accountId or folderId for email");
        return;
      }

      const sessionTitle = buildManualEmailSessionTitle(email, agentId);
      pendingSession = {
        accountId,
        folderId,
        messageId,
        emailKey: emailIdentityKeyFromParts(accountId, folderId, messageId),
        agentId,
        sessionTitle,
      };
      pendingEmailByTitleRef.current.set(sessionTitle, pendingSession);

      const hasAttachment = String(email.hasAttachment ?? "0") === "1";
      let uploadedAttachments: UploadedEmailAttachment[] = [];
      let uploadErrors: { file: string; error: string }[] = [];
      let emailContent = "";

      try {
        // Use fetchEmailById to get full content AND upload attachments
        const emailWithAttachments = await window.electron.fetchEmailById(
          accountId,
          folderId,
          messageId
        ) as EmailWithAttachments;
        
        if (emailWithAttachments?.emailContent) {
          emailContent = extractEmailContent(emailWithAttachments.emailContent);
        }
        
        if (emailWithAttachments?.attachments) {
          uploadedAttachments = emailWithAttachments.attachments.files ?? [];
          uploadErrors = emailWithAttachments.attachments.uploadErrors ?? [];
          if (uploadedAttachments.length > 0) {
            // mark that this email effectively has attachments even if metadata disagrees
            email.hasAttachment = "1" as any;
          }
        }
      } catch (detailError) {
        console.warn(
          `[useProcessEmailToAgent] Failed to fetch full content for message ${messageId}:`,
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

      // Append additional user instructions if provided
      if (additionalInstructions && additionalInstructions.trim()) {
        promptSections.push(
          "## Additional User Instructions",
          additionalInstructions.trim()
        );
      }

      const prompt = promptSections.join("\n\n");

      const chatAttachments: ChatAttachment[] = uploadedAttachments.map(toChatAttachment);

      window.electron.sendClientEvent({
        type: "session.start",
        payload: {
          title: sessionTitle,
          prompt,
          attachments: chatAttachments,
          cwd: "",
          agentId,
          background: true, // Don't switch to this session
          isEmailSession: true, // Mark as email session (don't show in sidebar)
        },
      });

      shouldAwaitConversation = true;

      // Mark email as processed on server
      try {
        const existingProcessedIds = await window.electron.getProcessedUnreadEmailIds(accountId, folderId);
        const mergedProcessedIds = Array.from(new Set([...(existingProcessedIds ?? []), messageId]));
        await window.electron.setProcessedUnreadEmailIds(accountId, folderId, mergedProcessedIds);
        console.log(`[useProcessEmailToAgent] Marked email ${messageId} as processed`);
      } catch (processError) {
        console.warn(`[useProcessEmailToAgent] Failed to mark email as processed:`, processError);
      }
    } catch (error) {
      console.error(`[useProcessEmailToAgent] Error processing email ${messageId}:`, error);
      if (pendingSession) {
        clearAwaitingTimeout(pendingSession.sessionTitle);
        pendingEmailByTitleRef.current.delete(pendingSession.sessionTitle);
      }
      setAwaitingConversationEmailId(prev => prev === emailKey ? null : prev);
      setErrorEmailId(emailKey);
      // Clear error after 5 seconds
      setTimeout(() => {
        setErrorEmailId(prev => prev === emailKey ? null : prev);
      }, 5000);
    } finally {
      setProcessingEmailId(prev => prev === emailKey ? null : prev);
      // Only enter awaiting state after a successful send. If the send path
      // failed before dispatching the session.start event, leave the email
      // retryable instead of disabled.
      if (shouldAwaitConversation && pendingSession) {
        beginAwaitingConversation(pendingSession);
      }
    }
  }, [beginAwaitingConversation, clearAwaitingTimeout]);

  return { 
    processEmailToAgent, 
    processingEmailId, 
    awaitingConversationEmailId,
    errorEmailId,
    // Helper to clear states manually if needed
    clearAwaitingConversation: () => {
      clearAwaitingTimeout();
      setAwaitingConversationEmailId(null);
    },
  };
}
