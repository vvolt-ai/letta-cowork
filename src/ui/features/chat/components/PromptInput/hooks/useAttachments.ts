/**
 * Hook for managing file attachments in the PromptInput component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uploadFileToManager, type UploadedFile } from "../../../../../services/fileUploads";
import {
  createAttachmentId,
  isImageFile,
  validateFile,
} from "../utils/formatPrompt";

export type AttachmentStatus = "pending" | "uploading" | "uploaded" | "error";

export interface AttachmentDraft {
  id: string;
  file: File;
  kind: "image" | "file";
  previewUrl?: string;
  status: AttachmentStatus;
  progress: number;
  error?: string;
  uploaded?: UploadedFile;
}

export interface UseAttachmentsOptions {
  disabled?: boolean;
  isRunning?: boolean;
  onUploadError?: (error: string) => void;
}

export interface UseAttachmentsResult {
  attachments: AttachmentDraft[];
  attachmentsRef: React.MutableRefObject<AttachmentDraft[]>;
  dragActive: boolean;
  isUploading: boolean;
  addFiles: (fileList: FileList | File[]) => void;
  removeAttachment: (id: string) => void;
  handleFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleDragEnter: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handlePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  readyAttachments: AttachmentDraft[];
  hasReadyAttachments: boolean;
  hasBlockingErrors: boolean;
  hasPendingUploads: boolean;
  canSend: boolean;
  cleanupAllAttachments: (list: AttachmentDraft[]) => void;
  clearAllAttachments: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  triggerFilePicker: () => void;
}

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsResult {
  const { disabled = false, isRunning = false, onUploadError } = options;

  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const attachmentsRef = useRef<AttachmentDraft[]>(attachments);
  const uploadingAttachmentIds = useRef<Set<string>>(new Set());
  const [dragActive, setDragActive] = useState(false);
  const [isUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep ref in sync
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Cleanup on unmount
  const cleanupAttachment = useCallback((attachment: AttachmentDraft) => {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }, []);

  const cleanupAllAttachments = useCallback(
    (list: AttachmentDraft[]) => {
      list.forEach(cleanupAttachment);
    },
    [cleanupAttachment]
  );

  useEffect(
    () => () => {
      cleanupAllAttachments(attachmentsRef.current);
      uploadingAttachmentIds.current.clear();
    },
    [cleanupAllAttachments]
  );

  const updateAttachment = useCallback(
    (id: string, updater: (attachment: AttachmentDraft) => AttachmentDraft) => {
      setAttachments((prev) =>
        prev.map((attachment) => (attachment.id === id ? updater(attachment) : attachment))
      );
    },
    []
  );

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (disabled && !isRunning) {
        console.debug("[useAttachments] ignoring files because input is disabled", {
          count: (fileList as unknown as { length?: number })?.length ?? 0,
        });
        return;
      }

      const files = Array.from(fileList as Iterable<File>);
      if (!files.length) return;

      console.debug(
        "[useAttachments] adding attachments",
        files.map((file) => ({ name: file.name, size: file.size, type: file.type }))
      );

      setAttachments((prev) => {
        const next = [...prev];
        for (const file of files) {
          const error = validateFile(file);
          const kind = isImageFile(file) ? "image" : "file";
          const previewUrl = kind === "image" && !error ? URL.createObjectURL(file) : undefined;
          if (error) {
            console.warn("[useAttachments] attachment validation failed", { name: file.name, error });
          }
          next.push({
            id: createAttachmentId(),
            file,
            kind,
            previewUrl,
            status: error ? "error" : "pending",
            progress: 0,
            error: error || undefined,
          });
        }
        return next;
      });

      setDragActive(false);
    },
    [disabled, isRunning]
  );

  const removeAttachment = useCallback(
    (id: string) => {
      console.debug("[useAttachments] removing attachment", { id });
      uploadingAttachmentIds.current.delete(id);
      setAttachments((prev) => {
        const target = prev.find((attachment) => attachment.id === id);
        if (target) {
          cleanupAttachment(target);
        }
        return prev.filter((attachment) => attachment.id !== id);
      });
    },
    [cleanupAttachment]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = event.target;
      if (files && files.length > 0) {
        addFiles(files);
      }
      event.target.value = "";
    },
    [addFiles]
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled && !isRunning) return;
      setDragActive(true);
      console.debug("[useAttachments] drag enter", {
        items: event.dataTransfer?.items?.length ?? 0,
      });
    },
    [disabled, isRunning]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled && !isRunning) return;
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled, isRunning]
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setDragActive(false);
    console.debug("[useAttachments] drag leave");
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled && !isRunning) return;
      setDragActive(false);
      const { files } = event.dataTransfer;
      if (files && files.length > 0) {
        console.debug("[useAttachments] drop received", { count: files.length });
        addFiles(files);
      }
    },
    [addFiles, disabled, isRunning]
  );

  const processClipboardItems = useCallback(
    (items?: DataTransferItemList | null) => {
      if (!items) return false;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file && isImageFile(file)) {
            files.push(file);
          }
        }
      }
      if (files.length > 0) {
        console.debug(
          "[useAttachments] clipboard provided images",
          files.map((file) => ({ name: file.name, size: file.size, type: file.type }))
        );
        addFiles(files);
        return true;
      }
      return false;
    },
    [addFiles]
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled && !isRunning) return;
      const handled = processClipboardItems(event.clipboardData?.items ?? null);
      if (handled) {
        event.preventDefault();
      }
    },
    [disabled, isRunning, processClipboardItems]
  );

  // Auto-upload pending attachments
  const startAttachmentUpload = useCallback(
    (attachment: AttachmentDraft) => {
      if (attachment.status !== "pending" || attachment.error) {
        return;
      }
      if (uploadingAttachmentIds.current.has(attachment.id)) {
        return;
      }

      uploadingAttachmentIds.current.add(attachment.id);
      console.debug("[useAttachments] starting attachment upload", {
        id: attachment.id,
        name: attachment.file.name,
      });

      updateAttachment(attachment.id, (current) => ({
        ...current,
        status: "uploading",
        progress: 0,
        error: undefined,
      }));

      void (async () => {
        try {
          const uploaded = await uploadFileToManager(attachment.file, {
            onProgress: ({ percent }: { percent: number }) => {
              updateAttachment(attachment.id, (current) => ({
                ...current,
                progress: percent,
              }));
            },
          });

          updateAttachment(attachment.id, (current) => ({
            ...current,
            status: "uploaded",
            progress: 100,
            uploaded,
            previewUrl:
              uploaded.mimeType && uploaded.mimeType.toLowerCase().startsWith("image/")
                ? uploaded.url
                : current.previewUrl,
          }));

          console.debug("[useAttachments] attachment upload complete", {
            id: attachment.id,
            url: uploaded.url,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          updateAttachment(attachment.id, (current) => ({
            ...current,
            status: "error",
            progress: 0,
            error: message,
          }));
          console.error("[useAttachments] attachment upload failed", {
            id: attachment.id,
            error,
          });
          onUploadError?.(message);
        } finally {
          uploadingAttachmentIds.current.delete(attachment.id);
        }
      })();
    },
    [onUploadError, updateAttachment]
  );

  useEffect(() => {
    attachments.forEach((attachment) => {
      if (attachment.status === "pending" && !attachment.error) {
        startAttachmentUpload(attachment);
      }
    });
  }, [attachments, startAttachmentUpload]);

  const readyAttachments = useMemo(
    () => attachments.filter((attachment) => attachment.status === "uploaded" && attachment.uploaded),
    [attachments]
  );

  const hasReadyAttachments = readyAttachments.length > 0;
  const hasBlockingErrors = useMemo(
    () => attachments.some((attachment) => attachment.status === "error" && !attachment.uploaded),
    [attachments]
  );
  const hasPendingUploads = useMemo(
    () => attachments.some((attachment) => attachment.status === "pending" || attachment.status === "uploading"),
    [attachments]
  );

  const canSend = !isUploading && !hasPendingUploads && !hasBlockingErrors;

  const clearAllAttachments = useCallback(() => {
    cleanupAllAttachments(attachmentsRef.current);
    uploadingAttachmentIds.current.clear();
    setAttachments([]);
  }, [cleanupAllAttachments]);

  const triggerFilePicker = useCallback(() => {
    if (disabled && !isRunning) return;
    fileInputRef.current?.click();
  }, [disabled, isRunning]);

  // Window paste handler
  useEffect(() => {
    const handleWindowPaste = (event: ClipboardEvent) => {
      if (disabled && !isRunning) return;
      if (event.defaultPrevented) return;
      const handled = processClipboardItems(event.clipboardData?.items ?? null);
      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => {
      window.removeEventListener("paste", handleWindowPaste);
    };
  }, [disabled, isRunning, processClipboardItems]);

  return {
    attachments,
    attachmentsRef,
    dragActive,
    isUploading,
    addFiles,
    removeAttachment,
    handleFileInputChange,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    readyAttachments,
    hasReadyAttachments,
    hasBlockingErrors,
    hasPendingUploads,
    canSend,
    cleanupAllAttachments,
    clearAllAttachments,
    fileInputRef: fileInputRef as React.RefObject<HTMLInputElement>,
    triggerFilePicker,
  };
}
