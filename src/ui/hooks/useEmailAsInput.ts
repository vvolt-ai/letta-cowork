import { useCallback, useState } from "react";
import type { ZohoEmail } from "../types";
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
    files: string[];
    markdownFiles: string[];
    path: string;
    lettaAttachment?: unknown;
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
        files: [] as string[],
        markdownFiles: [] as string[],
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
          attachmentsInfo = {
            hasAttachments: result.attachments.files.length > 0,
            files: result.attachments.files,
            markdownFiles: result.attachments.markdownFiles,
          };
          
          // Store the download path for reference
          const downloadPath = result.attachments.path;
          
          // Add absolute paths to markdown files if path is available
          if (downloadPath && result.attachments.markdownFiles.length > 0) {
            // Update markdown files to include absolute path
            attachmentsInfo.markdownFiles = result.attachments.markdownFiles.map(mdFile => {
              const fileName = mdFile.split(/[/\\]/).pop() || mdFile;
              return `${downloadPath}/${fileName}`;
            });
          }
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
        
        // List original files
        if (attachmentsInfo.files.length > 0) {
          emailPrompt.push("### Original Files");
          for (const file of attachmentsInfo.files) {
            const fileName = file.split(/[/\\]/).pop() || file;
            emailPrompt.push(`- ${escapeMd(fileName)}`);
          }
        }
        
        // List converted markdown files with absolute path
        if (attachmentsInfo.markdownFiles.length > 0) {
          emailPrompt.push("");
          emailPrompt.push("### Converted Documents (Markdown)");
          emailPrompt.push("**Absolute File Paths:**");
          for (const mdFile of attachmentsInfo.markdownFiles) {
            const fileName = mdFile.split(/[/\\]/).pop() || mdFile;
            emailPrompt.push(`- \`${escapeMd(mdFile)}\` (${escapeMd(fileName)})`);
          }
          emailPrompt.push("");
          emailPrompt.push("_Note: PDF attachments have been converted to markdown format for better agent understanding._");
        }
      }

      setPrompt(prompt.trim() ? `${prompt}\n\n${emailPrompt.join("\n")}` : emailPrompt.join("\n"));
      setIsLoading(false);
    },
    [prompt, setPrompt]
  );

  return { setEmailAsInput, isLoading };
}
