interface ToolExecutionBlockProps {
  name: string;
  status: "running" | "succeeded" | "failed";
  input?: string | null;
  output?: string | null;
  logs?: string[];
}

const statusCopy: Record<ToolExecutionBlockProps["status"], { label: string }> = {
  running: { label: "Running tool" },
  succeeded: { label: "Tool returned" },
  failed: { label: "Tool failed" },
};

export function ToolExecutionBlock({ name, status, input, output, logs = [] }: ToolExecutionBlockProps) {
  const copy = statusCopy[status];
  const isRunning = status === "running";
  const isError = status === "failed";

  return (
    <section
      className={`max-w-2xl rounded-xl border px-4 py-3 text-sm shadow-sm ${
        isError
          ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)]"
          : "border-[var(--color-tool-border)] bg-[var(--color-tool-bg)]"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
        {status === "running" ? (
          <span
            className="inline-flex h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent"
            aria-hidden
          />
        ) : (
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            {isError ? (
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
        )}
        <span>{copy.label}</span>
      </div>

      <div className="mt-2 text-sm font-medium text-ink-800">{name}</div>

      {input ? (
        <div className="mt-2 rounded-md border border-[var(--color-border)] bg-white/70 px-3 py-2 text-xs text-muted">
          <div className="font-semibold uppercase tracking-[0.2em] text-[10px] text-ink-500">Input</div>
          <pre className="mt-1 whitespace-pre-wrap text-ink-700">{input}</pre>
        </div>
      ) : null}

      {output ? (
        <div className="mt-2 rounded-md bg-white/60 px-3 py-2 text-xs text-ink-700">
          <div className="font-semibold uppercase tracking-[0.2em] text-[10px] text-ink-500">Output</div>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{output}</pre>
        </div>
      ) : null}

      {logs.length > 0 ? (
        <div className="mt-2 rounded-md bg-white/40 px-3 py-2 text-xs text-muted">
          <div className="font-semibold uppercase tracking-[0.2em] text-[10px] text-ink-500">Logs</div>
          <ul className="mt-1 space-y-1">
            {logs.map((log, index) => (
              <li key={index} className="whitespace-pre-wrap leading-relaxed">
                {log}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isRunning ? (
        <div className="mt-2 text-xs text-muted">Waiting for tool response…</div>
      ) : null}
    </section>
  );
}
