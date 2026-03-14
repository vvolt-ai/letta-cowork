import type { ChatAttachment } from "../types";

const MAX_TITLE_LENGTH = 60;

const capitalize = (value: string) => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const cleanWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
};

const extractAttachmentDescriptor = (attachments: ChatAttachment[]): string | undefined => {
  if (!attachments.length) return undefined;
  const imageCount = attachments.filter((attachment) => attachment.kind === "image").length;
  const fileCount = attachments.length - imageCount;

  if (attachments.length === 1) {
    const [attachment] = attachments;
    return attachment.kind === "image" ? "Image chat" : truncate(attachment.name, MAX_TITLE_LENGTH);
  }

  if (imageCount === attachments.length) {
    return `${imageCount} image${imageCount === 1 ? "" : "s"}`;
  }

  if (fileCount === attachments.length) {
    return `${fileCount} file${fileCount === 1 ? "" : "s"}`;
  }

  return `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`;
};

export function generateSessionTitle(prompt: string, attachments: ChatAttachment[] = []): string {
  const cleanedPrompt = cleanWhitespace(prompt || "");

  if (cleanedPrompt) {
    const sentenceMatch = cleanedPrompt.match(/[^.!?\n]+[.!?]?/);
    const sentence = sentenceMatch ? sentenceMatch[0] : cleanedPrompt;
    const candidate = truncate(capitalize(sentence.trim()), MAX_TITLE_LENGTH);
    if (candidate) return candidate;
  }

  const attachmentDescriptor = extractAttachmentDescriptor(attachments);
  if (attachmentDescriptor) {
    return truncate(capitalize(attachmentDescriptor), MAX_TITLE_LENGTH);
  }

  const timestamp = new Date();
  const formattedTime = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `New session ${formattedTime}`;
}

export function sanitizeSessionTitle(title: string, fallback: string): string {
  const cleaned = cleanWhitespace(title);
  if (!cleaned) return fallback;
  return truncate(cleaned, MAX_TITLE_LENGTH);
}
