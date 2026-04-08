import { memo, useMemo, useState } from "react";

interface ReasoningBlockProps {
  steps: string[];
}

export const ReasoningBlock = memo(function ReasoningBlock({ steps }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = useMemo(() => {
    const first = steps[0]?.trim() ?? "";
    if (!first) return "Internal reasoning captured";
    return first.length > 120 ? `${first.slice(0, 117)}…` : first;
  }, [steps]);

  if (steps.length === 0) return null;

  return (
    <section className="max-w-3xl rounded-2xl border border-[var(--color-tool-border)] bg-[var(--color-tool-bg)]/80 px-4 py-3 text-sm shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Reasoning</div>
          <div className="mt-1 text-sm text-ink-700">{preview}</div>
          <div className="mt-1 text-[11px] text-muted">{steps.length} step{steps.length === 1 ? "" : "s"}</div>
        </div>
        <span className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-ink-600">
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {expanded ? (
        <ul className="mt-3 space-y-2 text-sm text-ink-700">
          {steps.map((step, index) => (
            <li key={index} className="flex gap-2 rounded-xl bg-white/60 px-3 py-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-status-thinking)]" />
              <span className="whitespace-pre-wrap leading-relaxed">{step}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
});
