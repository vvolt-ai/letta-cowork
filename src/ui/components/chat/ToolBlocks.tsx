import { memo, useEffect, useMemo, useRef } from "react";

interface ToolExecutionBlockProps {
  name: string;
  status: "running" | "succeeded" | "failed";
  input?: string | null;
  output?: string | null;
  logs?: string[];
}

const statusCopy: Record<ToolExecutionBlockProps["status"], { label: string; helper: string }> = {
  running: { label: "Running tool", helper: "Showing live tool input and output as it arrives" },
  succeeded: { label: "Tool completed", helper: "Showing the captured tool input and output" },
  failed: { label: "Tool failed", helper: "Showing the captured tool input and error output" },
};

export const ToolExecutionBlock = memo(function ToolExecutionBlock({ name, status, input, output, logs = [] }: ToolExecutionBlockProps) {
  const copy = statusCopy[status];
  const isRunning = status === "running";
  const isError = status === "failed";
  const outputRef = useRef<HTMLPreElement | null>(null);
  const logsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isRunning) return;
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [isRunning, output, logs]);

  const liveSummary = useMemo(() => {
    if (isError) return "Needs attention";
    if (isRunning) return logs.length > 0 || output ? "Live output updating" : "Starting up";
    return "Finished";
  }, [isError, isRunning, logs.length, output]);

  return (
    <section
      className={`max-w-5xl rounded-[24px] border px-5 py-4 text-sm shadow-[0_10px_24px_rgba(15,23,42,0.06)] ${
        isError
          ? "border-[var(--color-error)]/35 bg-[var(--color-error-light)]/80"
          : "border-[var(--color-tool-border)] bg-[var(--color-tool-bg)]/92"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
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
          <div className="mt-2 text-lg font-semibold text-ink-900">{name}</div>
          <div className="mt-1 text-sm text-muted">{copy.helper}</div>
        </div>

        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isError
            ? "bg-[var(--color-error)]/10 text-[var(--color-error)]"
            : isRunning
              ? "bg-[var(--color-warning-light)] text-[var(--color-warning)]"
              : "bg-[var(--color-success-light)] text-[var(--color-success)]"
        }`}>
          {liveSummary}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          {input ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 px-4 py-3 text-xs text-muted shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold uppercase tracking-[0.22em] text-[10px] text-ink-500">Tool input</div>
                <div className="text-[10px] text-muted">Captured arguments</div>
              </div>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--color-surface-secondary)] px-3 py-3 font-mono text-[12px] leading-6 text-ink-800">{input}</pre>
            </div>
          ) : null}

          {logs.length > 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-white/70 px-4 py-3 text-xs text-muted shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold uppercase tracking-[0.22em] text-[10px] text-ink-500">Progress log</div>
                <div className="text-[10px] text-muted">{logs.length} update{logs.length === 1 ? "" : "s"}</div>
              </div>
              <div ref={logsRef} className="mt-2 max-h-48 overflow-auto space-y-2">
                {logs.map((log, index) => (
                  <div key={index} className="rounded-xl bg-[var(--color-surface-secondary)] px-3 py-2 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink-700">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[#0f172a] px-4 py-3 text-xs text-slate-100 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold uppercase tracking-[0.22em] text-[10px] text-slate-300">Tool output</div>
              <div className="text-[10px] text-slate-400">Auto-scroll {isRunning ? "on" : "off"}</div>
            </div>
            <pre ref={outputRef} className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-black/20 px-3 py-3 font-mono text-[12px] leading-6 text-slate-100">{output || (isRunning ? "Waiting for tool output…" : "No output captured.")}</pre>
          </div>
        </div>
      </div>

      {isRunning ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <span className="inline-flex h-2 w-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
          Watching for more tool updates…
        </div>
      ) : null}
    </section>
  );
});
