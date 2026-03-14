interface ReasoningBlockProps {
  steps: string[];
}

export function ReasoningBlock({ steps }: ReasoningBlockProps) {
  if (steps.length === 0) return null;

  return (
    <section className="max-w-2xl rounded-xl border border-[var(--color-tool-border)] bg-[var(--color-tool-bg)] px-4 py-3 text-sm shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Thinking</div>
      <ul className="mt-2 space-y-1.5 text-sm text-ink-700">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--color-status-thinking)]" />
            <span className="whitespace-pre-wrap leading-relaxed">{step}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
