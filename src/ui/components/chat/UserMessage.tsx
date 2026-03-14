import type { UserPromptMessage } from "../../types";

const formatBytes = (bytes: number): string => {
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

export function UserMessage({ message }: { message: UserPromptMessage }) {
  const attachments = message.attachments ?? [];

  return (
    <article className="ml-auto max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-ink-800 shadow-sm">
      <div className="mb-2 flex justify-end text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        You
      </div>
      {message.prompt ? (
        <p className="whitespace-pre-wrap leading-relaxed">{message.prompt}</p>
      ) : null}
      {attachments.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-[var(--color-attachment-border)] bg-[var(--color-attachment-bg)] px-3 py-2 text-xs text-ink-700 transition hover:border-[var(--color-accent)]"
            >
              {(() => {
                const mimeType = attachment.mimeType || "";
                const isImage =
                  attachment.kind === "image" ||
                  mimeType.toLowerCase().startsWith("image/");
                const remoteUrl = attachment.url && attachment.url.startsWith("http") ? attachment.url : undefined;
                const previewUrl = attachment.previewUrl || remoteUrl;
                if (isImage && previewUrl) {
                  return (
                    <span className="flex h-12 w-12 overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-sm">
                      <img src={previewUrl} alt={attachment.name} className="h-full w-full object-cover" />
                    </span>
                  );
                }
                return (
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-ink-500">
                    📄
                  </span>
                );
              })()}
              <span className="flex flex-col">
                <span className="font-medium text-ink-800">
                  {attachment.name}
                </span>
                <span className="text-muted">{formatBytes(attachment.size || 0)}</span>
              </span>
              <span className="ml-auto text-[var(--color-accent)] opacity-0 transition group-hover:opacity-100">↗</span>
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}
