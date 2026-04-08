/**
 * Prompt formatting utilities for the PromptInput component.
 */

import type { ChatAttachment } from "../../../../../types";

/**
 * Format bytes into a human-readable string.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

/**
 * Check if a file is an image based on its MIME type.
 */
export const isImageFile = (file: File): boolean => file.type.startsWith("image/");

/**
 * Create a unique attachment ID.
 */
export const createAttachmentId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Maximum upload size in bytes (25 MB).
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Validate a file for upload.
 * Returns an error message if invalid, null if valid.
 */
export const validateFile = (file: File): string | null => {
  if (file.size > MAX_UPLOAD_BYTES) {
    return "File exceeds the 25 MB upload limit.";
  }
  if (!file.size) {
    return "File is empty.";
  }
  return null;
};

/**
 * Build text with file links appended.
 */
export const buildTextWithLinks = (baseText: string, metas: ChatAttachment[]): string => {
  let text = baseText;
  const nonImages = metas.filter((meta) => meta.kind === "file");
  if (nonImages.length > 0) {
    const appendix = `Attached files:\n${nonImages.map((meta) => `- ${meta.name}: ${meta.url}`).join("\n")}`;
    text = text ? `${text}\n\n${appendix}` : appendix;
  }
  if (!text.trim() && metas.length > 0) {
    text = metas
      .map((meta) => `${meta.kind === "image" ? "Image" : "File"}: ${meta.url}`)
      .join("\n");
  }
  return text;
};

/**
 * Format Letta CLI output for display.
 */
export function formatLettaCliOutput(cliArgs: string[], rawOutput: string): string {
  try {
    const parsed = JSON.parse(rawOutput);
    const body = Array.isArray(parsed) ? parsed : (parsed?.body ?? parsed?.items ?? parsed);

    if (cliArgs[0] === "agents" && cliArgs[1] === "list" && Array.isArray(body)) {
      if (body.length === 0) return "No agents found.";
      return body
        .map((agent: any) => {
          const name = agent?.name ?? "Unnamed agent";
          const id = agent?.id ?? "unknown-id";
          const model = agent?.model ? ` — ${agent.model}` : "";
          const description = agent?.description ? `\n  ${String(agent.description).slice(0, 140)}` : "";
          return `- ${name} — ${id}${model}${description}`;
        })
        .join("\n");
    }

    if (cliArgs[0] === "agents" && Array.isArray(body)) {
      return JSON.stringify(body, null, 2);
    }

    if (typeof body === "object") {
      const cleaned = sanitizeLettaOutput(body);
      return JSON.stringify(cleaned, null, 2);
    }
  } catch {}

  return rawOutput || "(no output)";
}

/**
 * Remove noisy keys from Letta output for cleaner display.
 */
function sanitizeLettaOutput(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeLettaOutput);
  if (!value || typeof value !== "object") return value;

  const noisyKeys = new Set([
    "message_ids",
    "system",
    "embedding_config",
    "llm_config",
    "model_settings",
    "compaction_settings",
    "memory",
    "blocks",
    "secrets",
    "response",
    "options",
  ]);

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (noisyKeys.has(key)) continue;
    result[key] = sanitizeLettaOutput(val);
  }
  return result;
}
