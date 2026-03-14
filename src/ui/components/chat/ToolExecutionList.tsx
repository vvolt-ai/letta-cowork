import { memo } from "react";
import type { ToolExecution } from "../../store/useAppStore";
import { formatDuration, truncateInput } from "../../utils/chat";

interface ToolExecutionListProps {
  tools: ToolExecution[];
}

const ToolExecutionCard = ({ tool }: { tool: ToolExecution }) => {
  const duration = formatDuration(tool.startedAt, tool.finishedAt);
  const inputText = tool.input ? truncateInput(tool.input, 160) : undefined;

  return (
    <div className="rounded-2xl border border-accent/20 bg-surface-secondary/70 px-4 py-3 shadow-soft">
      <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-ink-800">
        <span>Running tool:</span>
        <span className="text-accent">{tool.name}</span>
        {duration ? <span className="text-xs text-muted">{duration}</span> : null}
      </div>
      {inputText ? (
        <div className="mt-2 text-xs text-muted">
          <span className="font-semibold text-muted">Input:</span> {inputText}
        </div>
      ) : null}
      {tool.updates.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {tool.updates.map((update, idx) => (
            <li key={idx} className="leading-relaxed">{update}</li>
          ))}
        </ul>
      ) : null}
      {tool.error ? (
        <div className="mt-2 rounded-xl bg-error-light/70 px-3 py-2 text-xs text-error">
          {tool.error}
        </div>
      ) : null}
    </div>
  );
};

export const ToolExecutionList = memo(({ tools }: ToolExecutionListProps) => {
  const runningTool = tools.find((tool) => tool.status === "running");
  if (!runningTool) return null;

  return <ToolExecutionCard tool={runningTool} />;
});

ToolExecutionList.displayName = "ToolExecutionList";
