import { memo, useCallback, useState } from "react";
import type { SDKAssistantMessage, MessageContentItem } from "@letta-ai/letta-code-sdk";
import MDContent from "../../../render/markdown";

function extractText(content: SDKAssistantMessage["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const items = content as MessageContentItem[];
    return items
      .map((item) => (item.type === "text" ? item.text : ""))
      .filter((text): text is string => Boolean(text && text.trim().length > 0))
      .join("\n\n");
  }
  return "";
}

interface AssistantMessageProps {
  message?: SDKAssistantMessage | null;
  fallbackText?: string;
  isStreaming?: boolean;
  agentName: string;
}

export const AssistantMessage = memo(function AssistantMessage({ message, fallbackText = "", isStreaming = false, agentName }: AssistantMessageProps) {
  const textContent = (message && extractText(message.content)) || fallbackText;
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }, [textContent]);

  if (!textContent && !isStreaming) {
    return null;
  }

  return (
    <article className="group relative w-full px-1 py-3">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        <span>{agentName}</span>
        {isStreaming ? (
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          </span>
        ) : null}
        {textContent && !isStreaming ? (
          <button
            type="button"
            onClick={onCopy}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white/80 px-2 py-0.5 text-[10px] font-medium tracking-normal normal-case text-ink-600 opacity-0 transition-opacity hover:text-ink-900 group-hover:opacity-100 focus:opacity-100"
            aria-label="Copy message"
          >
            {copied ? (
              <>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
                Copy
              </>
            )}
          </button>
        ) : null}
      </div>
      {textContent ? (
        <div className="[&>*:first-child]:mt-0 [&>p:first-child]:mt-0">
          <MDContent text={textContent} />
          {isStreaming ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1.05em] w-[2px] -translate-y-[1px] animate-pulse bg-[var(--color-accent)] align-middle"
            />
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-muted">
          <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
          <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
          <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
        </div>
      )}
    </article>
  );
});
