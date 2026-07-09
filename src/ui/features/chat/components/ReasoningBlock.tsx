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
    <section className="max-w-3xl rounded-2xl border border-[var(--color-tool-border)] bg-[var(--color-tool-bg)]/70 px-4 py-3 text-sm shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted">Reasoning</div>
          <div className="mt-1 truncate text-sm font-medium text-ink-800">{preview}</div>
          <div className="mt-1 text-[11px] text-muted">{cleanedSteps.length} step{cleanedSteps.length === 1 ? "" : "s"}</div>
        </div>
        <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-ink-600 shadow-sm">
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {expanded ? (
        <ol className="mt-3 space-y-1.5 text-sm text-ink-700">
          {cleanedSteps.map((step, index) => (
            <li key={`${index}-${step.slice(0, 32)}`} className="flex gap-2 rounded-lg bg-white/55 px-3 py-2 leading-snug">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-status-thinking)]" />
              <span className="min-w-0 whitespace-pre-wrap break-words">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
});
