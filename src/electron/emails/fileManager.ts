import path from "path";
import { readFile, stat } from "fs/promises";

interface FileManagerUploadResponse {
  success: boolean;
  file_id: string;
  file_name: string;
  url: string;
}

export interface FileManagerUploadResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

const DEFAULT_BASE_URL = "https://filemanage.ngrok.app";
const BASE_URL_ENV_KEYS = [
  "FILE_MANAGER_BASE_URL",
  "VITE_FILE_MANAGER_BASE_URL",
  "LETTA_FILE_MANAGER_BASE_URL",
];

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
  ".zip": "application/zip",
};

type UploadOptions = {
  baseUrl?: string;
  overrideMimeType?: string;
};

function sanitizeBaseUrl(raw?: string | null): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return DEFAULT_BASE_URL;
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function resolveBaseUrl(explicit?: string): string {
  if (explicit) return sanitizeBaseUrl(explicit);

  for (const key of BASE_URL_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      return sanitizeBaseUrl(value);
    }
  }

  return DEFAULT_BASE_URL;
}

function guessMimeType(fileName: string, override?: string): string {
  if (override) return override;
  const ext = path.extname(fileName).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export async function uploadFilePathToManager(
  filePath: string,
  options: UploadOptions = {}
): Promise<FileManagerUploadResult> {
  const stats = await stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`Cannot upload non-file path: ${filePath}`);
  }

  const fileName = path.basename(filePath);
  const mimeType = guessMimeType(fileName, options.overrideMimeType);
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const uploadUrl = `${baseUrl}/files/upload`;

  console.debug("[fileManager] uploading attachment", {
    filePath,
    fileName,
    mimeType,
    size: stats.size,
    uploadUrl,
  });

  const fileBuffer = await readFile(filePath);
  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, fileName);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`File manager upload failed (${response.status}): ${text || response.statusText}`);
  }

  let parsed: FileManagerUploadResponse;
  try {
    parsed = (await response.json()) as FileManagerUploadResponse;
  } catch (error) {
    throw new Error(`File manager returned non-JSON response: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed?.success || !parsed.file_id || !parsed.url) {
    throw new Error("File manager response missing required fields");
  }

  return {
    fileId: parsed.file_id,
    fileName: parsed.file_name || fileName,
    mimeType,
    size: stats.size,
    url: parsed.url,
  };
}
