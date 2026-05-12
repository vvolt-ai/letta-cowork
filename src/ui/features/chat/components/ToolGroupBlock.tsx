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
import { ToolExecutionBlock } from "./ToolBlocks";

interface ToolGroupBlockProps {
  group: ToolGroupTimelineEntry;
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

  // Auto-expand while running, collapse when done — but respect any
  // manual override the user has made.
  const [userOverride, setUserOverride] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState<boolean>(runningCount > 0);

  useEffect(() => {
    if (userOverride !== null) return;
    setExpanded(runningCount > 0);
  }, [runningCount, userOverride]);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (runningCount > 0) parts.push(`${runningCount} running`);
    if (failedCount > 0) parts.push(`${failedCount} failed`);
    if (succeededCount > 0 && (runningCount > 0 || failedCount > 0)) {
      parts.push(`${succeededCount} done`);
    }
    if (parts.length === 0) return "all succeeded";
    return parts.join(" · ");
  }, [runningCount, failedCount, succeededCount]);

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
        className="flex w-full items-center gap-2 text-left"
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
          {!expanded ? (
            <span className="text-[12px] text-muted truncate">— {summary}</span>
          ) : null}
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
        <div className="mt-1 ml-5 flex flex-col gap-0.5 border-l border-[var(--color-border)] pl-2">
          {children.map((child) => (
            <ToolExecutionBlock
              key={child.id}
              name={child.name}
              status={child.status}
              input={child.input}
              output={child.output}
              logs={child.logs}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
});
