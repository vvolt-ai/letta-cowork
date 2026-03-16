import { useCallback, useState } from "react";
import type { ZohoEmail, UploadedEmailAttachment } from "../types";
import { useAppStore } from "../store/useAppStore";

interface EmailWithAttachments {
  emailContent: {
    subject?: string;
    fromAddress?: string;
    toAddress?: string;
    ccAddress?: string;
    sender?: string;
    summary?: string;
    content?: string;
    body?: string;
    hasAttachment?: string;
    [key: string]: unknown;
  };
  attachments: {
    files: UploadedEmailAttachment[];
    uploadErrors: { file: string; error: string }[];
  } | null;
}

/**
 * Escape markdown special characters
 */
function escapeMd(text: string): string {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\|/g, "\\|")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/:/g, "\\:")
    .replace(/</g, "<")
    .replace(/>/g, ">");
}

/**
 * Format content as a code block
 */
function toCodeBlock(content: string, language: string = "text"): string {
  return `\`\`\`${language}\n${content}\n\`\`\``;
}

function formatBytes(size: number): string {
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
}

function attachmentLine(attachment: UploadedEmailAttachment): string {
  const sizeLabel = formatBytes(attachment.size);
  const details = [attachment.mimeType, sizeLabel]
    .filter(Boolean)
    .join(" · ");
  return `- [${escapeMd(attachment.fileName)}](${attachment.url})${details ? ` (${details})` : ""}`;
}

/**
 * Extract readable text from email content
 */
function extractEmailContent(content: unknown): string {
  if (!content) return "";
  
  const emailData = content as Record<string, unknown>;
  
  // Try various content fields
  const contentFields = ["content", "body", "plainBody", "htmlBody", "summary"];
  
  for (const field of contentFields) {
    const value = emailData[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  
  // If no content field, stringify the whole object (limited)
  return JSON.stringify(emailData, null, 2).slice(0, 5000);
}

export function useEmailAsInput() {
  const prompt = useAppStore((state) => state.prompt);
  const setPrompt = useAppStore((state) => state.setPrompt);
  const [isLoading, setIsLoading] = useState(false);

  const setEmailAsInput = useCallback(
    async (email: ZohoEmail) => {
      setIsLoading(true);
      // First, get full email content and download attachments
      let emailContent = "";
      let attachmentsInfo = {
        hasAttachments: false,
        files: [] as UploadedEmailAttachment[],
        uploadErrors: [] as { file: string; error: string }[],
      };

      // Ensure we have required fields
      const accountId = email.accountId;
      const folderId = email.folderId;
      const messageId = String(email.messageId);

      if (!accountId || !folderId) {
        console.error("Missing accountId or folderId for email");
        return;
      }

      try {
        // Fetch full email content with attachments
        const result = (await window.electron.fetchEmailById(
          accountId,
          folderId,
          messageId
        )) as EmailWithAttachments;

        if (result?.emailContent) {
          // Extract readable content
          emailContent = extractEmailContent(result.emailContent);
        }

        if (result?.attachments) {
          const uploads = result.attachments.files ?? [];

          attachmentsInfo = {
            hasAttachments: uploads.length > 0,
            files: uploads,
            uploadErrors: result.attachments.uploadErrors ?? [],
          };
        }
      } catch (error) {
        console.error("Failed to fetch email details:", error);
        // Fallback to summary if fetch fails
        emailContent = email.summary || "";
      }

      // Build the formatted prompt for the agent
      const emailPrompt = [
        "# Email Request",
        "Please help me analyze and process this email:",
        "",
        "## Email Metadata",
        `| Field | Value |`,
        `| --- | --- |`,
        `| Message ID | ${escapeMd(String(email.messageId))} |`,
        `| Account ID | ${escapeMd(String(email.accountId))} |`,
        `| Folder ID | ${escapeMd(String(email.folderId))} |`,
        `| From | ${escapeMd(email.sender || email.fromAddress || "Unknown")} |`,
        `| To | ${escapeMd(email.toAddress || "N/A")} |`,
        `| CC | ${escapeMd(email.ccAddress || "N/A")} |`,
        `| Subject | ${escapeMd(email.subject || "(No subject)")} |`,
        `| Received | ${escapeMd(email.receivedTime || "N/A")} |`,
        `| Has Attachments | ${attachmentsInfo.hasAttachments ? "Yes" : "No"} |`,
        "",
        "## Email Content",
        toCodeBlock(emailContent || email.summary || "No content available", "text"),
      ];

      // Add attachment information if present
      if (attachmentsInfo.hasAttachments) {
        emailPrompt.push("");
        emailPrompt.push("## Attachments");
        
        // List uploaded files
        if (attachmentsInfo.files.length > 0) {
          emailPrompt.push("### Files");
          for (const file of attachmentsInfo.files) {
            emailPrompt.push(attachmentLine(file));
          }
        }

        if (attachmentsInfo.uploadErrors.length > 0) {
          emailPrompt.push("");
          emailPrompt.push("### Attachment Upload Warnings");
          for (const warning of attachmentsInfo.uploadErrors) {
            emailPrompt.push(`- ${escapeMd(warning.file)}: ${escapeMd(warning.error)}`);
          }
        }
      }

      setPrompt(prompt.trim() ? `${prompt}\n\n${emailPrompt.join("\n")}` : emailPrompt.join("\n"));
      setIsLoading(false);
    },
    [prompt, setPrompt]
  );

  return { setEmailAsInput, isLoading };
}
