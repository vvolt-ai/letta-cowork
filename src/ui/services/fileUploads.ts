/**
 * Helpers for uploading files to the local file-manager service.
 */

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export interface UploadResult {
  success: boolean;
  file_id: string;
  file_name: string;
  url: string;
}

export interface UploadedFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  baseUrl?: string;
}

const ENV_BASE_URL = (typeof import.meta !== "undefined" && (import.meta as any)?.env?.VITE_FILE_MANAGER_BASE_URL)
  || (typeof process !== "undefined" && (process.env as Record<string, string | undefined>)?.VITE_FILE_MANAGER_BASE_URL)
  || (typeof window !== "undefined" && (window as any).__LETTA_FILE_MANAGER_BASE_URL);

const DEFAULT_FILE_MANAGER_BASE_URL = ENV_BASE_URL || "https://filemanage.ngrok.app";
const UPLOAD_ENDPOINT = "/files/upload";

const sanitizeBaseUrl = (baseUrl?: string): string => {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) return DEFAULT_FILE_MANAGER_BASE_URL;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

export const FILE_MANAGER_BASE_URL = sanitizeBaseUrl();

export function uploadFileToManager(file: File, options: UploadOptions = {}): Promise<UploadedFile> {
  const { onProgress, signal, baseUrl } = options;
  const targetBaseUrl = sanitizeBaseUrl(baseUrl || FILE_MANAGER_BASE_URL);
  const uploadUrl = `${targetBaseUrl}${UPLOAD_ENDPOINT}`;

  console.debug("[uploadFileToManager] starting upload", {
    name: file.name,
    size: file.size,
    type: file.type,
    uploadUrl,
  });

  return new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl, true);
    xhr.responseType = "text";

    const cleanup = () => {
      xhr.upload.removeEventListener("progress", handleProgress);
      xhr.removeEventListener("error", handleError);
      xhr.removeEventListener("abort", handleAbort);
    };

    const handleProgress = (event: ProgressEvent<EventTarget>) => {
      if (!event.lengthComputable) return;
      const percent = event.total > 0 ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : 0;
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        percent,
      });
    };

    const buildError = (status: number, message: string, phase: string) => {
      const error = new Error(`Upload failed (${status}): ${message}`);
      (error as Error & { details?: Record<string, unknown> }).details = {
        status,
        statusText: xhr.statusText,
        response: xhr.responseText,
        headers: xhr.getAllResponseHeaders?.() ?? null,
        phase,
      };
      return error;
    };

    const handleError = () => {
      cleanup();
      const error = buildError(xhr.status || 0, xhr.statusText || "Network error", "onerror");
      console.error("[uploadFileToManager] network error", error, (error as any).details);
      reject(error);
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.upload.addEventListener("progress", handleProgress);
    xhr.addEventListener("error", handleError);
    xhr.addEventListener("abort", handleAbort);

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      cleanup();

      const contentType = xhr.getResponseHeader("Content-Type") || "";
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = contentType.includes("application/json")
            ? (JSON.parse(xhr.responseText) as UploadResult)
            : null;
          if (!response || !response.success) {
            throw new Error("Upload failed: invalid response from file manager");
          }

          const uploaded: UploadedFile = {
            fileId: response.file_id,
            fileName: response.file_name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            url: response.url,
          };

          console.debug("[uploadFileToManager] upload complete", {
            name: uploaded.fileName,
            url: uploaded.url,
          });

          resolve(uploaded);
        } catch (error) {
          const formatted = buildError(xhr.status, String(error), "parse-success-response");
          console.error("[uploadFileToManager] response parsing failed", formatted, (formatted as any).details);
          reject(formatted);
        }
        return;
      }

      const message = contentType.includes("application/json")
        ? (() => {
            try {
              const parsed = JSON.parse(xhr.responseText);
              return parsed?.message || parsed?.error || JSON.stringify(parsed);
            } catch {
              return xhr.statusText || "Unknown error";
            }
          })()
        : xhr.statusText || xhr.responseText || "Unknown error";

      const error = buildError(xhr.status || 0, message, "http-error");
      console.error("[uploadFileToManager] upload failed", error, (error as any).details);
      reject(error);
    };

    if (signal) {
      if (signal.aborted) {
        cleanup();
        reject(new DOMException("Upload aborted", "AbortError"));
        return;
      }
      const abortListener = () => {
        xhr.abort();
      };
      signal.addEventListener("abort", abortListener, { once: true });
      xhr.addEventListener("loadend", () => {
        signal.removeEventListener("abort", abortListener);
      });
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      xhr.send(formData);
    } catch (error) {
      cleanup();
      const formatted = buildError(xhr.status || 0, String(error), "send");
      console.error("[uploadFileToManager] send failed", formatted, (formatted as any).details);
      reject(formatted);
    }
  });
}
