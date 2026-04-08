/**
 * AttachmentPreview component - displays attached files with status and remove button.
 */

import { memo } from "react";
import type { AttachmentDraft } from "./hooks/useAttachments";
import { formatBytes } from "./utils/formatPrompt";

export interface AttachmentPreviewProps {
  attachments: AttachmentDraft[];
  onRemove: (id: string) => void;
}

export const AttachmentPreview = memo(function AttachmentPreview({
  attachments,
  onRemove,
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={`group flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs shadow-sm ${
            attachment.status === "error"
              ? "border-[var(--color-status-error)]/30 bg-[var(--color-status-error)]/5 text-[var(--color-status-error)]"
              : attachment.status === "uploaded"
                ? "border-[var(--color-status-completed)]/30 bg-[var(--color-status-completed)]/5 text-ink-700"
                : "border-[var(--color-attachment-border)] bg-[var(--color-attachment-bg)] text-ink-700"
          }`}
        >
          {attachment.previewUrl ? (
            <span className="flex h-8 w-8 overflow-hidden rounded-lg border border-[var(--color-attachment-border)] bg-white">
              <img
                src={attachment.previewUrl}
                alt={attachment.file.name}
                className="h-full w-full object-cover"
              />
            </span>
          ) : null}
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {attachment.kind === "image" ? "Image" : "File"}
          </span>
          <span className="font-medium text-ink-800">{attachment.file.name}</span>
          <span className="text-muted">{formatBytes(attachment.file.size)}</span>
          {attachment.status === "uploading" ? (
            <span className="text-[var(--color-accent)]">
              {attachment.progress > 0 ? `Uploading ${Math.round(attachment.progress)}%` : "Uploading…"}
            </span>
          ) : null}
          {attachment.status === "error" ? (
            <span className="text-[var(--color-status-error)]">Failed</span>
          ) : null}
          {attachment.status === "uploaded" ? (
            <span className="text-[var(--color-status-completed)]">Ready</span>
          ) : null}
          <button
            type="button"
            className="ml-1 text-muted transition hover:text-ink-900"
            onClick={() => onRemove(attachment.id)}
            aria-label={`Remove ${attachment.file.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
});
