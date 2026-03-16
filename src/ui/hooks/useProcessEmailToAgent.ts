import { useCallback, useState } from "react";
import type { ZohoEmail, UploadedEmailAttachment, ChatAttachment } from "../types";

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

/**
 * Hook to process an email and send it to an agent session
 * Similar to auto-sync but triggered manually
 */
export function useProcessEmailToAgent() {
  const [processingEmailId, setProcessingEmailId] = useState<string | null>(null);
  const [successEmailId, setSuccessEmailId] = useState<string | null>(null);
  
  const processEmailToAgent = useCallback(async (email: ZohoEmail, agentId: string) => {
    const messageId = String(email.messageId);
    setProcessingEmailId(messageId);
    setSuccessEmailId(null);
    try {
      const accountId = email.accountId;
      const folderId = email.folderId;
      const messageId = String(email.messageId);

      if (!accountId || !folderId) {
        console.error("Missing accountId or folderId for email");
        return;
      }

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

      const prompt = promptSections.join("\n\n");

      const chatAttachments: ChatAttachment[] = uploadedAttachments.map(toChatAttachment);

      window.electron.sendClientEvent({
        type: "session.start",
        payload: {
          title: `Email: ${email.subject || email.messageId}`,
          prompt,
          attachments: chatAttachments,
          cwd: "",
          agentId,
        },
      });
    } finally {
      setProcessingEmailId(null);
      setSuccessEmailId(messageId);
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessEmailId((current) => (current === messageId ? null : current));
      }, 3000);
    }
  }, []);

  return { processEmailToAgent, processingEmailId, successEmailId };
}
