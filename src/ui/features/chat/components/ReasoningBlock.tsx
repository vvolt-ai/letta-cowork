import { memo, useMemo, useState } from "react";

interface ReasoningBlockProps {
  steps: string[];
}

const stripMarkdownChrome = (value: string) => value
  .replace(/<!--([\s\S]*?)-->/g, "")
  .replace(/^\s*[-*]\s+/gm, "")
  .replace(/(^|\s)\*\*([^*\n]+)\*\*(?=\s|$)/g, "$1$2")
  .replace(/(^|\s)__([^_\n]+)__(?=\s|$)/g, "$1$2")
  .replace(/`([^`]+)`/g, "$1")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const cleanReasoningSteps = (steps: string[]) => steps
  .map(stripMarkdownChrome)
  .filter((step) => step.length > 0 && step !== "-->");

export const ReasoningBlock = memo(function ReasoningBlock({ steps }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const cleanedSteps = useMemo(() => cleanReasoningSteps(steps), [steps]);
  const preview = useMemo(() => {
    const first = cleanedSteps[0] ?? "";
    if (!first) return "Internal reasoning captured";
    const oneLine = first.replace(/\s+/g, " ").trim();
    return oneLine.length > 96 ? `${oneLine.slice(0, 93)}…` : oneLine;
  }, [cleanedSteps]);

  if (cleanedSteps.length === 0) return null;

  return (
    <section className="max-w-4xl overflow-hidden rounded-2xl border border-[var(--color-tool-border)] bg-[var(--color-bg-000)]/40 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-[var(--color-surface-hover)]/50"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9.5 4.5a3 3 0 015 0A3.5 3.5 0 0118 8v1a3 3 0 012 5.2A3.5 3.5 0 0116.5 19H15a3 3 0 01-6 0H7.5A3.5 3.5 0 014 14.2 3 3 0 016 9V8a3.5 3.5 0 013.5-3.5Z" /></svg>
            <span className="text-xs font-medium text-muted">Reasoning</span>
            {!expanded ? <span className="truncate text-[11px] italic text-muted/70">{preview}</span> : null}
          </div>
        </div>
        <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center text-muted">
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {expanded ? (
        <ol className="max-h-72 space-y-1.5 overflow-auto border-t border-[var(--color-border)] px-4 py-3 text-sm text-ink-700">
          {cleanedSteps.map((step, index) => (
            <li key={`${index}-${step.slice(0, 32)}`} className="flex gap-2 rounded-lg bg-[var(--color-surface)]/55 px-3 py-1.5 leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-status-thinking)]" />
              <span className="min-w-0 whitespace-pre-wrap break-words">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
});
