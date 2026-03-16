import path from "path";
import { unlink } from "fs/promises";
import { uploadFilePathToManager, type FileManagerUploadResult } from "../emails/fileManager.js";

export type UploadedBridgeAttachmentKind = "image" | "file";

export interface UploadedBridgeAttachment extends FileManagerUploadResult {
  kind: UploadedBridgeAttachmentKind;
}

export interface UploadDescriptor {
  path: string;
  kind?: UploadedBridgeAttachmentKind;
  overrideMimeType?: string;
}

export interface UploadOptions {
  unlinkAfter?: boolean;
  contextLabel?: string;
}

export interface UploadOutcome {
  attachments: UploadedBridgeAttachment[];
  warnings: string[];
}

const DEFAULT_OPTIONS: Required<UploadOptions> = {
  unlinkAfter: true,
  contextLabel: "",
};

export async function uploadLocalFilesToManager(
  descriptors: UploadDescriptor[],
  options: UploadOptions = {}
): Promise<UploadOutcome> {
  const { unlinkAfter, contextLabel } = { ...DEFAULT_OPTIONS, ...options };
  const attachments: UploadedBridgeAttachment[] = [];
  const warnings: string[] = [];

  for (const descriptor of descriptors) {
    const { path: filePath, overrideMimeType, kind } = descriptor;
    const fileName = path.basename(filePath);
    try {
      const uploadResult = await uploadFilePathToManager(filePath, {
        overrideMimeType,
      });

      const resolvedKind: UploadedBridgeAttachmentKind = kind
        ?? (uploadResult.mimeType.toLowerCase().startsWith("image/") ? "image" : "file");

      attachments.push({
        ...uploadResult,
        kind: resolvedKind,
      });

      if (unlinkAfter) {
        try {
          await unlink(filePath);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          warnings.push(
            `Uploaded ${fileName} but failed to delete temporary file at ${filePath}${
              contextLabel ? ` (${contextLabel})` : ""
            }: ${reason}`
          );
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(
        `Failed to upload ${fileName}${contextLabel ? ` (${contextLabel})` : ""}: ${reason}. File remains at ${filePath}.`
      );
    }
  }

  return { attachments, warnings };
}
