import { memo, useEffect, useState } from "react";
import type { ReasoningStep } from "../../store/useAppStore";

interface ReasoningPanelProps {
  steps: ReasoningStep[];
}

export const ReasoningPanel = memo(({ steps }: ReasoningPanelProps) => {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (steps.length > 0) {
      setExpanded(true);
    }
  }, [steps.length]);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-ink-900/10 bg-surface px-4 py-3 shadow-soft">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between text-left text-xs font-medium uppercase tracking-[0.2em] text-muted"
      >
        <span>Reasoning</span>
        <span className="text-muted-light">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded ? (
        <div className="mt-3 text-sm leading-relaxed text-ink-700">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-light">Thinking…</div>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            {steps.map((step) => (
              <li key={step.id} className="whitespace-pre-wrap">
                {step.content}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});

ReasoningPanel.displayName = "ReasoningPanel";
