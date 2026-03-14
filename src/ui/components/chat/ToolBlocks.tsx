interface ToolCallBlockProps {
  name: string;
  input?: string | null;
}

export function ToolCallBlock({ name, input }: ToolCallBlockProps) {
  return (
    <section className="max-w-2xl rounded-xl border border-[var(--color-tool-border)] bg-[var(--color-tool-bg)] px-4 py-3 text-sm text-ink-700 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Running Tool</div>
      <div className="mt-2 text-sm font-medium text-ink-800">{name}</div>
      {input ? (
        <p className="mt-1 text-xs text-muted">{input}</p>
      ) : null}
    </section>
  );
}

interface ToolResultBlockProps {
  name: string;
  output?: string | null;
  isError?: boolean;
  logs?: string[];
}

export function ToolResultBlock({ name, output, isError = false, logs = [] }: ToolResultBlockProps) {
  return (
    <section className={`max-w-2xl rounded-xl border px-4 py-3 text-sm shadow-sm ${
      isError
        ? "border-[var(--color-error)]/40 bg-[var(--color-error-light)]"
        : "border-[var(--color-tool-border)] bg-[var(--color-tool-bg)]"
    }`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">Tool Result</div>
      <div className="mt-2 text-sm font-medium text-ink-800">{name}</div>
      {output ? (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-white/60 px-3 py-2 text-xs text-ink-700">
          {output}
        </pre>
      ) : null}
      {logs.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {logs.map((log, index) => (
            <li key={index} className="whitespace-pre-wrap leading-relaxed">
              {log}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
