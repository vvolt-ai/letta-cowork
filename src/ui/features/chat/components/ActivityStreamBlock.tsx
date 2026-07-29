import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ActivityTimelineEntry } from "../types";
import { ToolExecutionBlock } from "./ToolBlocks";

interface ActivityStreamBlockProps {
  entries: ActivityTimelineEntry[];
  isLive: boolean;
}

const cleanReasoning = (value: string) => value
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/^\s*[-*]\s+/gm, "")
  .replace(/(^|\s)\*\*([^*\n]+)\*\*(?=\s|$)/g, "$1$2")
  .replace(/(^|\s)__([^_\n]+)__(?=\s|$)/g, "$1$2")
  .replace(/`([^`]+)`/g, "$1")
  .trim();

export const ActivityStreamBlock = memo(function ActivityStreamBlock({ entries, isLive }: ActivityStreamBlockProps) {
  const [expanded, setExpanded] = useState(isLive);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const wasLiveRef = useRef(isLive);
  const contentKey = useMemo(() => entries.map((entry) => {
    if (entry.kind === "reasoning") return `${entry.id}:${entry.steps.join("").length}`;
    return `${entry.id}:${entry.status}:${entry.output?.length ?? 0}:${entry.logs?.length ?? 0}`;
  }).join("|"), [entries]);

  useEffect(() => {
    if (isLive) {
      setExpanded(true);
    } else if (wasLiveRef.current) {
      setExpanded(false);
    }
    wasLiveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    if (!expanded || !isLive) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contentKey, expanded, isLive]);

  const toolCount = entries.filter((entry) => entry.kind === "tool").length;
  const reasoningCount = entries.reduce((count, entry) => count + (entry.kind === "reasoning" ? entry.steps.length : 0), 0);
  const summary = [
    reasoningCount > 0 ? `${reasoningCount} thought${reasoningCount === 1 ? "" : "s"}` : null,
    toolCount > 0 ? `${toolCount} action${toolCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/42">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-[var(--color-surface-hover)]/55"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${isLive ? "animate-pulse bg-[var(--color-accent)]" : "bg-[var(--color-success)]"}`} />
        <span className="text-sm font-medium text-ink-700">{isLive ? "Working" : "Activity"}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{isLive ? "Following Vera’s progress live" : summary}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded ? (
        <div
          ref={viewportRef}
          className="max-h-[360px] scroll-smooth overflow-y-auto border-t border-[var(--color-border)] px-4 py-3"
          aria-live={isLive ? "polite" : "off"}
        >
          <div className="relative space-y-1 before:absolute before:bottom-3 before:left-[6px] before:top-3 before:w-px before:bg-[var(--color-border)]">
            {entries.flatMap((entry) => {
              if (entry.kind === "reasoning") {
                return entry.steps.map((step, index) => {
                  const text = cleanReasoning(step);
                  if (!text) return null;
                  const isLast = isLive && entry === entries[entries.length - 1] && index === entry.steps.length - 1;
                  return (
                    <div key={`${entry.id}:${index}`} className="relative flex gap-3 py-1.5 pl-0.5">
                      <span className={`relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--color-surface)] ${isLast ? "animate-pulse bg-[var(--color-accent)]" : "bg-[var(--color-muted)]"}`} />
                      <p className={`min-w-0 whitespace-pre-wrap text-[13px] leading-5 ${isLast ? "text-ink-800" : "text-ink-600"}`}>{text}</p>
                    </div>
                  );
                });
              }

              return [
                <div key={entry.id} className="relative pl-5">
                  <span className={`absolute left-[2px] top-3 z-10 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-surface)] ${entry.status === "running" ? "animate-pulse bg-[var(--color-accent)]" : entry.status === "failed" ? "bg-[var(--color-error)]" : "bg-[var(--color-success)]"}`} />
                  <ToolExecutionBlock
                    name={entry.name}
                    status={entry.status}
                    input={entry.input}
                    output={entry.output}
                    logs={entry.logs}
                  />
                </div>,
              ];
            })}
            {isLive ? (
              <div className="relative flex items-center gap-3 py-1.5 pl-0.5 text-xs text-muted">
                <span className="relative z-10 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-accent)]" />
                <span>Preparing next step…</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
});
