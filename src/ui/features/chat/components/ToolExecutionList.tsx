import { memo } from "react";
import type { ToolExecution } from "../../../store/useAppStore";
import { formatDuration, truncateInput } from "../../../utils/chat";

interface ToolExecutionListProps {
  tools: ToolExecution[];
}

const ToolExecutionCard = ({ tool }: { tool: ToolExecution }) => {
  const duration = formatDuration(tool.startedAt, tool.finishedAt);
  const inputText = tool.input ? truncateInput(tool.input, 160) : undefined;

  return (
    <div className="px-1 py-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
        <span className="inline-flex h-5 w-5 items-center justify-center">
          <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4m0 12v4m-8-8H2m20 0h-4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          </svg>
        </span>
        <span className="font-medium">{tool.name}</span>
        {duration ? <span className="text-xs text-muted">{duration}</span> : null}
      </div>
      {inputText ? (
        <div className="mt-1 text-xs text-muted ml-7">
          {inputText}
        </div>
      ) : null}
      {tool.updates.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-xs text-muted ml-7">
          {tool.updates.map((update, idx) => (
            <li key={idx} className="leading-relaxed">{update}</li>
          ))}
        </ul>
      ) : null}
      {tool.error ? (
        <div className="mt-2 ml-7 text-xs text-red-600">
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
