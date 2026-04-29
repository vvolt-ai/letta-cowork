import { memo, useEffect, useMemo, useRef, useState } from "react";

interface ToolExecutionBlockProps {
  name: string;
  status: "running" | "succeeded" | "failed";
  input?: string | null;
  output?: string | null;
  logs?: string[];
}

interface TodoItem {
  content: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
}

function parseTodoInput(input?: string | null): TodoItem[] | null {
  if (!input?.trim()) return null;
  try {
    const parsed = JSON.parse(input);
    const todos = parsed?.todos;
    if (!Array.isArray(todos)) return null;
    return todos
      .filter((t): t is TodoItem => t && typeof t === "object" && typeof t.content === "string" && typeof t.status === "string")
      .map((t) => ({ content: t.content, activeForm: t.activeForm, status: t.status as TodoItem["status"] }));
  } catch {
    return null;
  }
}

function summarizeToolInput(name: string, input?: string | null): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();

  if (name === "TodoWrite") {
    const todos = parseTodoInput(input);
    if (!todos || todos.length === 0) return "Updated task list";
    const done = todos.filter((t) => t.status === "completed").length;
    const inProgress = todos.find((t) => t.status === "in_progress");
    if (inProgress) {
      const label = inProgress.activeForm ?? inProgress.content;
      return `${label} (${done}/${todos.length})`;
    }
    return `${todos.length} task${todos.length === 1 ? "" : "s"} · ${done} done`;
  }

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

function TodoListView({ todos }: { todos: TodoItem[] }) {
  return (
    <ul className="mt-1.5 space-y-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2">
      {todos.map((todo, idx) => {
        const isDone = todo.status === "completed";
        const isActive = todo.status === "in_progress";
        return (
          <li key={idx} className="flex items-start gap-2 text-[13px] leading-5">
            {isDone ? (
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] bg-green-500 text-white">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.5">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
            ) : isActive ? (
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-2 border-blue-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              </span>
            ) : (
              <span className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 rounded-[3px] border-2 border-gray-300" />
            )}
            <span
              className={
                isDone
                  ? "text-ink-400 line-through"
                  : isActive
                    ? "font-medium text-ink-900"
                    : "text-ink-700"
              }
            >
              {isActive && todo.activeForm ? todo.activeForm : todo.content}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export const ToolExecutionBlock = memo(function ToolExecutionBlock({ name, status, input, output, logs = [] }: ToolExecutionBlockProps) {
  const isRunning = status === "running";
  const isError = status === "failed";
  const isTodoWrite = name === "TodoWrite";
  const [expanded, setExpanded] = useState(isTodoWrite);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const todos = useMemo(() => (isTodoWrite ? parseTodoInput(input ?? null) : null), [isTodoWrite, input]);

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
          {isTodoWrite && todos ? (
            <TodoListView todos={todos} />
          ) : safeInput ? (
            <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-gray-50 px-2.5 py-1.5 font-mono text-[11px] text-ink-700">
              <div className="overflow-auto whitespace-pre-wrap">{safeInput}</div>
            </div>
          ) : null}
          {!isTodoWrite && transcript ? (
            <div className={outputContainerClass}>
              <pre ref={outputRef} className={outputTextClass}>{transcript}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
