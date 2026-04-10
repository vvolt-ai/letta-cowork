import { memo } from "react";
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

  if (!textContent && !isStreaming) {
    return null;
  }

  return (
    <article className="w-full px-1 py-3">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        <span>{agentName}</span>
        {isStreaming ? (
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          </span>
        ) : null}
      </div>
      {textContent ? (
        <div className="[&>*:first-child]:mt-0 [&>p:first-child]:mt-0">
          <MDContent text={textContent} />
        </div>
      ) : (
        <div className="text-muted">…</div>
      )}
    </article>
  );
});
