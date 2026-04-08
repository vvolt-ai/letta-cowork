/**
 * Loading indicator for when agent is processing
 */

import type { AgentDisplayStatus } from "../../../../store/useAppStore";

export type TimelineLoadingProps = {
  agentName: string;
  agentStatus: AgentDisplayStatus;
};

const PROCESSING_STATUSES = new Set(["thinking", "running_tool", "generating"]);

export function TimelineLoading({ agentName, agentStatus }: TimelineLoadingProps) {
  if (!PROCESSING_STATUSES.has(agentStatus)) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 px-1 py-2 text-sm text-muted">
      <span className="inline-flex h-4 w-4 items-center justify-center">
        <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
        </svg>
      </span>
      <span className="text-ink-600">
        {agentStatus === "thinking" && `${agentName} is thinking...`}
        {agentStatus === "running_tool" && `${agentName} is running tools...`}
        {agentStatus === "generating" && `${agentName} is responding...`}
      </span>
    </div>
  );
}
