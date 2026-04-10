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
  const [expanded, setExpanded] = useState(false);
  const outputRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!isRunning || !expanded) return;
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [expanded, isRunning, output, logs]);

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
    ? "mt-1.5 overflow-hidden rounded-lg border border-red-200 bg-red-50"
    : isRunning
      ? "mt-1.5 overflow-hidden rounded-lg border border-blue-200 bg-blue-50"
      : "mt-1.5 overflow-hidden rounded-lg border border-green-200 bg-green-50";
  const outputTextClass = isError
    ? "max-h-60 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-5 text-red-900"
    : isRunning
      ? "max-h-60 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-5 text-blue-900"
      : "max-h-60 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-5 text-green-900";

  return (
    <section className="max-w-4xl px-1 py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${
          isError ? "text-red-500" : isRunning ? "text-blue-500" : "text-green-500"
        }`}>
          {isRunning ? (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4m0 12v4m-8-8H2m20 0h-4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          ) : isError ? (
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={`text-[12px] font-medium ${statusToneClass}`}>{name}</span>
          {summary && !expanded ? <span className="text-[12px] text-muted truncate">— {summary}</span> : null}
        </div>
        <span className="text-ink-300 shrink-0">
          <svg viewBox="0 0 24 24" className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      {expanded ? (
        <div className="mt-1.5 ml-5">
          {safeInput ? (
            <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-gray-50 px-2.5 py-1.5 font-mono text-[11px] text-ink-700">
              <div className="overflow-auto whitespace-pre-wrap">{safeInput}</div>
            </div>
          ) : null}
          {transcript ? (
            <div className={outputContainerClass}>
              <pre ref={outputRef} className={outputTextClass}>{transcript}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
