/**
 * Renders individual timeline message entries
 */

import type { TimelineEntry } from "../../types";
import { UserMessage } from "../UserMessage";
import { AssistantMessage } from "../AssistantMessage";
import { ReasoningBlock } from "../ReasoningBlock";
import { ToolExecutionBlock } from "../ToolBlocks";

export type TimelineMessageProps = {
  entry: TimelineEntry;
  agentName: string;
};

/**
 * Renders a single timeline entry based on its kind
 */
export function TimelineMessage({ entry, agentName }: TimelineMessageProps) {
  switch (entry.kind) {
    case "user":
      return <UserMessage key={entry.id} message={entry.message as any} />;
    case "assistant":
      return (
        <AssistantMessage
          key={entry.id}
          message={entry.message}
          fallbackText={entry.text}
          agentName={agentName}
          isStreaming={entry.streaming}
        />
      );
    case "reasoning":
      return <ReasoningBlock key={entry.id} steps={entry.steps} />;
    case "tool":
      return (
        <ToolExecutionBlock
          key={entry.id}
          name={entry.name}
          status={entry.status}
          input={entry.input}
          output={entry.output}
          logs={entry.logs}
        />
      );
    case "cli_result":
      return (
        <CliResultBlock
          key={entry.id}
          id={entry.id}
          command={entry.command}
          output={entry.output}
          exitCode={entry.exitCode}
        />
      );
    default:
      return null;
  }
}

/**
 * Renders CLI result as a styled block
 */
function CliResultBlock({
  command,
  output,
  exitCode,
}: {
  id: string;
  command: string;
  output: string;
  exitCode: number;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-ink-900/10 bg-[#0d1117] shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Local Letta CLI</div>
        <div className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${exitCode === 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>
          exit {exitCode}
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="mb-2 font-mono text-xs text-emerald-200">$ letta {command}</div>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/20 p-3 font-mono text-xs leading-5 text-slate-100">{output}</pre>
      </div>
    </div>
  );
}
