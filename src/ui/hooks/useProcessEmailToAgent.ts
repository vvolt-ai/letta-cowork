import { useCallback, useState } from "react";
import type { ZohoEmail } from "../types";

interface EmailWithAttachments {
  emailContent: Record<string, unknown>;
  attachments: {
    files: string[];
    markdownFiles: string[];
    path: string;
    lettaAttachment?: unknown;
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

const buildAttachmentsSection = (hasAttachment: boolean, attachmentFileNames: string[], markdownFileNames: string[] = []): string => {
  if (!hasAttachment) return "No attachments reported for this email.";
  
  const sections: string[] = [];
  
  // Original files
  if (attachmentFileNames.length > 0) {
    sections.push("### Original Files");
    sections.push(...attachmentFileNames.map((name) => `- \`${name}\``));
  }
  
  // Markdown converted files
  if (markdownFileNames.length > 0) {
    sections.push("");
    sections.push("### Converted Documents (Markdown)");
    sections.push("**Absolute File Paths:**");
    sections.push(...markdownFileNames.map((name) => `- \`${escapeMd(name)}\``));
    sections.push("");
    sections.push("_Note: PDF attachments have been converted to markdown format for better agent understanding._");
  }
  
  if (sections.length === 0) {
    return "Attachments exist and were uploaded, but file names could not be resolved. Inspect the latest uploaded files.";
  }

  return sections.join("\n");
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
      let attachmentFileNames: string[] = [];
      let markdownFileNames: string[] = [];
      let emailContent = "";

      try {
        // Use fetchEmailById to get full content AND download attachments
        const emailWithAttachments = await window.electron.fetchEmailById(
          accountId,
          folderId,
          messageId
        ) as EmailWithAttachments;
        
        // Extract email content
        if (emailWithAttachments?.emailContent) {
          emailContent = extractEmailContent(emailWithAttachments.emailContent);
        }
        
        // Extract attachment info including markdown files
        if (emailWithAttachments?.attachments) {
          attachmentFileNames = emailWithAttachments.attachments.files;
          
          // Add absolute paths to markdown files
          const downloadPath = emailWithAttachments.attachments.path;
          if (downloadPath && emailWithAttachments.attachments.markdownFiles.length > 0) {
            markdownFileNames = emailWithAttachments.attachments.markdownFiles.map(mdFile => {
              const fileName = mdFile.split(/[/\\]/).pop() || mdFile;
              return `${downloadPath}/${fileName}`;
            });
          } else {
            markdownFileNames = emailWithAttachments.attachments.markdownFiles;
          }
        }
      } catch (detailError) {
        console.warn(
          `[useProcessEmailToAgent] Failed to fetch full content for message ${messageId}:`,
          detailError
        );
      }

      const prompt = [
        buildEmailMarkdownPrompt(email, agentId, emailContent, hasAttachment),
        "## Attachment Files",
        buildAttachmentsSection(hasAttachment, attachmentFileNames, markdownFileNames),
      ].join("\n\n");

      window.electron.sendClientEvent({
        type: "session.start",
        payload: {
          title: `Email: ${email.subject || email.messageId}`,
          prompt,
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
