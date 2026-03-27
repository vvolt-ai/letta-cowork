import type { ChatAttachment } from "../types";
import type { SessionView } from "../store/useAppStore";

const MAX_TITLE_LENGTH = 60;
const AUTO_EMAIL_SESSION_PREFIX = "Auto Email:";
const MANUAL_EMAIL_SESSION_PREFIX = "Email:";
const EMAIL_SESSION_PREFIXES = [AUTO_EMAIL_SESSION_PREFIX, MANUAL_EMAIL_SESSION_PREFIX];
const DAY_MS = 24 * 60 * 60 * 1000;

type AutoEmailSessionLike = Pick<SessionView, "title" | "lastPrompt" | "updatedAt">;

export type AutoEmailSessionDateBucket = "today" | "yesterday" | "older" | "unknown";

export interface AutoEmailSessionMetadata {
  subject: string;
  sender: string;
  senderKey: string;
  messageId?: string;
  receivedAt?: number;
  receivedDateKey: string;
  receivedDateLabel: string;
  receivedTimeLabel?: string;
  dateBucket: AutoEmailSessionDateBucket;
}

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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractPromptTableValue = (prompt: string | undefined, field: string): string | undefined => {
  if (!prompt) return undefined;
  const pattern = new RegExp(`\\|\\s*${escapeRegExp(field)}\\s*\\|\\s*(.*?)\\s*\\|`);
  const match = prompt.match(pattern);
  const value = match?.[1];
  return value ? cleanWhitespace(value.replace(/<br\s*\/?/gi, " ").replace(/>/g, " ")) : undefined;
};

const hasEmailPromptMetadata = (prompt: string | undefined): boolean => {
  if (!prompt) return false;
  return Boolean(
    extractPromptTableValue(prompt, "Email Type")
    || extractPromptTableValue(prompt, "From")
    || extractPromptTableValue(prompt, "Message ID")
    || extractPromptTableValue(prompt, "Received Time")
  );
};

const normalizeSender = (value: string | undefined): string => {
  const cleaned = cleanWhitespace(value ?? "");
  return cleaned || "Unknown sender";
};

const startOfDay = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const parseTimestamp = (value: string | undefined, fallback: number | undefined): number | undefined => {
  if (value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : undefined;
};

const getDateBucket = (timestamp: number | undefined): AutoEmailSessionDateBucket => {
  if (!timestamp) return "unknown";
  const todayStart = startOfDay(Date.now());
  const dateStart = startOfDay(timestamp);
  if (dateStart === todayStart) return "today";
  if (dateStart === todayStart - DAY_MS) return "yesterday";
  return "older";
};

const getDateLabel = (timestamp: number | undefined, bucket: AutoEmailSessionDateBucket): string => {
  if (!timestamp) return "Unknown date";
  if (bucket === "today") return "Today";
  if (bucket === "yesterday") return "Yesterday";
  return new Date(timestamp).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getTimeLabel = (timestamp: number | undefined): string | undefined => {
  if (!timestamp) return undefined;
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
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

export function isAutoEmailSessionTitle(title: string): boolean {
  const cleaned = cleanWhitespace(title);
  return EMAIL_SESSION_PREFIXES.some((prefix) => cleaned.startsWith(prefix));
}

export function isAutoEmailSession(session: Pick<SessionView, "title" | "lastPrompt">): boolean {
  return isAutoEmailSessionTitle(session.title || "") || hasEmailPromptMetadata(session.lastPrompt);
}

export function getAutoEmailSessionSubject(title: string, lastPrompt?: string): string {
  const cleaned = cleanWhitespace(title);
  const matchingPrefix = EMAIL_SESSION_PREFIXES.find((prefix) => cleaned.startsWith(prefix));
  if (!matchingPrefix) {
    const promptSubject = extractPromptTableValue(lastPrompt, "Subject");
    return promptSubject || cleaned || "Untitled email conversation";
  }

  const withoutPrefix = cleaned.slice(matchingPrefix.length).trim();
  const subject = withoutPrefix.replace(/\s*\[msg:.*$/i, "").trim();
  if (subject) {
    return subject;
  }

  const promptSubjectFallback = extractPromptTableValue(lastPrompt, "Subject");
  return promptSubjectFallback || "Untitled email conversation";
}

export function getAutoEmailSessionMetadata(session: AutoEmailSessionLike): AutoEmailSessionMetadata | null {
  if (!isAutoEmailSession({ title: session.title, lastPrompt: session.lastPrompt })) {
    return null;
  }

  const sender = normalizeSender(extractPromptTableValue(session.lastPrompt, "From"));
  const senderKey = sender.toLowerCase();
  const messageId = extractPromptTableValue(session.lastPrompt, "Message ID");
  const receivedAt = parseTimestamp(extractPromptTableValue(session.lastPrompt, "Received Time"), session.updatedAt);
  const dateBucket = getDateBucket(receivedAt);
  const receivedDateKey = receivedAt ? new Date(startOfDay(receivedAt)).toISOString() : "unknown-date";

  return {
    subject: getAutoEmailSessionSubject(session.title || "", session.lastPrompt),
    sender,
    senderKey,
    messageId,
    receivedAt,
    receivedDateKey,
    receivedDateLabel: getDateLabel(receivedAt, dateBucket),
    receivedTimeLabel: getTimeLabel(receivedAt),
    dateBucket,
  };
}
