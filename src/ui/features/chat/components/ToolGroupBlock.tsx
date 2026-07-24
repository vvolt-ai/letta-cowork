/**
 * Collapsed header for a run of consecutive same-name tool calls.
 *
 * Behaviour:
 *  - Default state: collapsed when no child is running, expanded while
 *    any child is running (so live progress stays visible). Once the
 *    burst finishes the group tidies itself back to one line.
 *  - User can override by clicking the header at any time. The manual
 *    override sticks for the lifetime of the component.
 *  - Expanded view simply renders each child via ToolExecutionBlock,
 *    preserving every existing per-tool feature (output panel, scroll,
 *    todo list view, etc.) — this component is presentational glue.
 */

import { memo, useEffect, useMemo, useState } from "react";
import type { ToolGroupTimelineEntry } from "../types";

interface ToolGroupBlockProps {
  group: ToolGroupTimelineEntry;
}

function summarizeChildInput(name: string, input?: string | null): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();

  if (name === "TodoWrite") {
    try {
      const parsed = JSON.parse(trimmed);
      const todos = Array.isArray(parsed?.todos) ? parsed.todos : [];
      const active = todos.find((todo: any) => todo?.status === "in_progress");
      if (active?.activeForm || active?.content) return active.activeForm ?? active.content;
      const completed = todos.filter((todo: any) => todo?.status === "completed").length;
      return todos.length > 0 ? `${completed}/${todos.length} tasks done` : "Updated tasks";
    } catch {
      return "Updated tasks";
    }
  }

  try {
    const parsed = JSON.parse(trimmed);
    const filePath = parsed?.file_path ?? parsed?.path;
    if (typeof filePath === "string") return filePath.split("/").slice(-2).join("/");
    const query = parsed?.query ?? parsed?.pattern ?? parsed?.symbol;
    if (typeof query === "string") return query.length > 72 ? `${query.slice(0, 69)}…` : query;
    const command = parsed?.command ?? parsed?.script;
    if (typeof command === "string") return command.length > 72 ? `${command.slice(0, 69)}…` : command;
  } catch {
    // Fall through to text summary.
  }

  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed;
}

export const ToolGroupBlock = memo(function ToolGroupBlock({ group }: ToolGroupBlockProps) {
  const { name, children } = group;

  // Aggregate status. Priority: any failed -> failed; any running ->
  // running; else succeeded. This matches what a user would intuit
  // from a multi-step batch.
  const { runningCount, failedCount, succeededCount } = useMemo(() => {
    let running = 0;
    let failed = 0;
    let succeeded = 0;
    for (const c of children) {
      if (c.status === "running") running += 1;
      else if (c.status === "failed") failed += 1;
      else if (c.status === "succeeded") succeeded += 1;
    }
    return { runningCount: running, failedCount: failed, succeededCount: succeeded };
  }, [children]);

  const aggregateStatus: "running" | "failed" | "succeeded" =
    runningCount > 0 ? "running" : failedCount > 0 ? "failed" : "succeeded";

  // Tool groups should stay compact by default. The header already shows live
  // progress, and expanded full cards make long runs visually dominate chat.
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<boolean>(false);

  useEffect(() => {
    if (userOverride !== null) return;
    if (aggregateStatus !== "running") setExpanded(false);
  }, [aggregateStatus, userOverride]);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (runningCount > 0) parts.push(`${runningCount} running`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);
    if (succeededCount > 0 && (runningCount > 0 || failedCount > 0)) {
      parts.push(`${succeededCount} done`);
    }
    if (parts.length === 0) parts.push("all succeeded");

    const names = Array.from(new Set(children.map((child) => child.name))).slice(0, 4);
    if (names.length > 0) {
      parts.push(names.join(", ") + (new Set(children.map((child) => child.name)).size > names.length ? ", …" : ""));
    }
    return parts.join(" · ");
  }, [children, runningCount, failedCount, succeededCount]);

  const statusToneClass =
    aggregateStatus === "failed"
      ? "text-red-700"
      : aggregateStatus === "running"
        ? "text-blue-700"
        : "text-green-700";

  const iconClass =
    aggregateStatus === "failed"
      ? "text-red-500"
      : aggregateStatus === "running"
        ? "text-blue-500"
        : "text-green-500";

  return (
    <section className="max-w-4xl px-1 py-0.5">
      <button
        type="button"
        onClick={() => {
          setUserOverride(!expanded);
          setExpanded((v) => !v);
        }}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-gray-50"
      >
        <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center ${iconClass}`}>
          {aggregateStatus === "running" ? (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4m0 12v4m-8-8H2m20 0h-4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
            </svg>
          ) : aggregateStatus === "failed" ? (
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
          <span className={`text-[12px] font-medium ${statusToneClass}`}>
            {name} ×{children.length}
          </span>
          <span className="truncate text-[12px] text-muted">— {summary}</span>
        </div>
        <span className="text-ink-300 shrink-0">
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      {expanded ? (
        <div className="mt-1 ml-5 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white/70">
          {children.map((child) => {
            const childFailed = child.status === "failed";
            const childRunning = child.status === "running";
            const childSummary = summarizeChildInput(child.name, child.input) ?? child.output ?? child.logs?.[0] ?? "No details";
            return (
              <div key={child.id} className="grid grid-cols-[18px_minmax(120px,180px)_1fr] items-center gap-2 border-b border-gray-100 px-3 py-1.5 last:border-b-0">
                <span className={`text-[12px] ${childFailed ? "text-red-500" : childRunning ? "text-blue-500" : "text-green-500"}`}>
                  {childRunning ? "•" : childFailed ? "!" : "✓"}
                </span>
                <span className="truncate text-[12px] font-medium text-ink-700">{child.name}</span>
                <span className="truncate text-[12px] text-muted">{childSummary}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
});
