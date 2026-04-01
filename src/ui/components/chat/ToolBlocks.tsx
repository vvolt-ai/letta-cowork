import { memo, useEffect, useMemo, useRef, useState } from "react";

interface ToolExecutionBlockProps {
  name: string;
  status: "running" | "succeeded" | "failed";
  input?: string | null;
  output?: string | null;
  logs?: string[];
}

function summarizeToolInput(name: string, input?: string | null): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();

  if (name === "Edit") {
    const fileMatch = trimmed.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
    return fileMatch ? `Updated (${fileMatch[1]})` : "Updated file contents";
  }

  if (name === "Read") {
    const fileMatch = trimmed.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
    return fileMatch ? `Read (${fileMatch[1]})` : "Read file contents";
  }

  if (name === "Write") {
    const fileMatch = trimmed.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/);
    return fileMatch ? `Wrote (${fileMatch[1]})` : "Wrote file contents";
  }

  return trimmed.length > 140 ? `${trimmed.slice(0, 137)}…` : trimmed;
}

export const ToolExecutionBlock = memo(function ToolExecutionBlock({ name, status, input, output, logs = [] }: ToolExecutionBlockProps) {
  const isRunning = status === "running";
  const isError = status === "failed";
  const [expanded, setExpanded] = useState(isRunning);
  const outputRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (isRunning) {
      setExpanded(true);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || !expanded) return;
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [expanded, isRunning, output, logs]);

  const headerLabel = useMemo(() => {
    if (isRunning) return `Tool running ${name}`;
    if (isError) return `Tool failed ${name}`;
    return `Tool returned ${name}`;
  }, [isError, isRunning, name]);

  const approvalLabel = useMemo(() => {
    if (isRunning) return "Approved request to run tool";
    if (isError) return "Tool execution failed";
    return "Approved request to run tool";
  }, [isError, isRunning]);

  const safeInput = useMemo(() => {
    const trimmed = input?.trim();
    if (!trimmed || trimmed === "}" || trimmed === "\"}" || trimmed === "{}") return null;
    return trimmed;
  }, [input]);

  const summary = useMemo(() => summarizeToolInput(name, safeInput), [name, safeInput]);
  const transcript = useMemo(() => {
    if (output?.trim()) return output;
    if (logs.length > 0) return logs.join("\n");
    return isRunning ? null : "No output captured.";
  }, [isRunning, logs, output]);

  const statusToneClass = isError ? "text-red-700" : isRunning ? "text-blue-700" : "text-green-700";
  const outputContainerClass = isError
    ? "mt-3 overflow-hidden rounded-xl border border-red-200 bg-red-50"
    : isRunning
      ? "mt-3 overflow-hidden rounded-xl border border-blue-200 bg-blue-50"
      : "mt-3 overflow-hidden rounded-xl border border-green-200 bg-green-50";
  const outputTextClass = isError
    ? "max-h-72 overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-[12px] leading-7 text-red-900"
    : isRunning
      ? "max-h-72 overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-[12px] leading-7 text-blue-900"
      : "max-h-72 overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-[12px] leading-7 text-green-900";

  return (
    <section className="max-w-4xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0">
          <div className={`text-[15px] font-semibold ${statusToneClass}`}>{headerLabel}</div>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-500 transition hover:bg-[var(--color-surface-secondary)]">
          <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      {expanded ? (
        <div className="px-5 pb-5">
          <div className="rounded-2xl border border-[var(--color-border)] bg-white px-4 py-4">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full ${
                isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}>
                {isError ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[14px] font-medium ${statusToneClass}`}>{approvalLabel}</div>
                {summary ? <div className="mt-1 text-[14px] text-ink-500">{summary}</div> : null}
                {safeInput ? (
                  <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2 font-mono text-[12px] text-ink-800">
                    <div className="overflow-auto whitespace-pre-wrap">{safeInput}</div>
                  </div>
                ) : null}
                {transcript ? (
                  <div className={outputContainerClass}>
                    <pre ref={outputRef} className={outputTextClass}>{transcript}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
});
