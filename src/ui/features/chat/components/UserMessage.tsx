import { memo, useMemo, useState } from "react";
import type { UserPromptMessage } from "../../../types";

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

/**
 * Heartbeat / system_alert / system-style payloads arrive as user
 * messages whose prompt is a JSON envelope (compaction summaries,
 * automated re-engagement alerts, etc.). Rendering them as a normal
 * "You" message confuses humans — those are clearly not what *they*
 * typed.
 *
 * If the prompt parses as JSON and looks like a system envelope,
 * we treat it as a system alert block — collapsed by default, styled
 * like a ToolExecutionBlock so it visually belongs with the
 * automation track rather than the human conversation.
 */
interface SystemEnvelope {
  type: string;
  message?: string;
  time?: string;
}

function parseSystemEnvelope(prompt: string | undefined | null): SystemEnvelope | null {
  if (!prompt) return null;
  const trimmed = prompt.trim();
  // Quick reject for human-typed prompts. JSON envelopes are always
  // wrapped in `{ ... }` and reasonably contain `"type"`.
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  if (!trimmed.includes(`"type"`)) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
      return parsed as SystemEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

function humanizeType(type: string): string {
  // "system_alert" -> "System alert"
  const spaced = type.replace(/[_-]+/g, " ").trim();
  if (!spaced) return type;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export const UserMessage = memo(function UserMessage({ message }: { message: UserPromptMessage }) {
  const attachments = message.attachments ?? [];
  const envelope = useMemo(() => parseSystemEnvelope(message.prompt), [message.prompt]);

  if (envelope) {
    return <SystemAlertBlock envelope={envelope} rawPrompt={message.prompt ?? ""} />;
  }

  return (
    <article className="ml-auto min-w-0 max-w-[80%] py-1" data-message-type="user">
      {message.prompt ? (
        <div className="rounded-[1.65rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-ink-900 shadow-[var(--shadow-soft)]">
          <p className="whitespace-pre-wrap break-words text-[14.5px] leading-6">{message.prompt}</p>
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-[var(--color-attachment-border)] bg-[var(--color-attachment-bg)] px-3 py-2 text-xs text-ink-700 transition hover:border-[var(--color-accent)]"
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
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-ink-800">
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
});

/**
 * Collapsed system-alert block — visual parity with ToolExecutionBlock
 * (chevron, label + summary, expandable detail) so the chat reads as
 * "tool track on the left, your messages on the right" without any
 * raw JSON disrupting the flow.
 */
function SystemAlertBlock({
  envelope,
  rawPrompt,
}: {
  envelope: SystemEnvelope;
  rawPrompt: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = humanizeType(envelope.type);
  const summary = envelope.message
    ? envelope.message.length > 140
      ? `${envelope.message.slice(0, 137)}…`
      : envelope.message
    : null;

  // Pretty JSON for the expanded detail view. Use the parsed envelope
  // rather than the raw prompt so the indentation is consistent
  // regardless of how the sender formatted the original payload.
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(rawPrompt), null, 2);
    } catch {
      return rawPrompt;
    }
  }, [rawPrompt]);

  return (
    <section className="max-w-4xl px-1 py-0.5" data-message-type="system-alert">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-amber-500">
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            {/* info-circle: matches tool-block icon weight/size */}
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-amber-700">{label}</span>
          {summary && !expanded ? (
            <span className="text-[12px] text-muted truncate">— {summary}</span>
          ) : null}
        </div>
        <span className="text-ink-300 shrink-0">
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      {expanded ? (
        <div className="mt-1.5 ml-5">
          <div className="overflow-hidden rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 font-mono text-[11px] text-amber-900">
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap">{pretty}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
