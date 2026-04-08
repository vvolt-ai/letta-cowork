/**
 * Types for EventCard components
 */

import type { StreamMessage, SDKAssistantMessage, CliResultMessage } from "../../types";
import type { ReasoningStep, ToolExecution, AgentDisplayStatus } from "../../store/useAppStore";
import type { IndexedMessage } from "../../hooks/useMessageWindow";

export type ToolStatus = "pending" | "success" | "error";

export type AskUserQuestionInput = {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
};

export type UserPromptCardMessage = {
  type: "user_prompt";
  prompt: string;
  attachments?: {
    id: string;
    name: string;
    size: number;
    url: string;
    kind: "image" | "file";
  }[];
};

/**
 * Types for ChatTimeline components
 */

export type TimelineEntry =
  | { kind: "user"; id: string; message: StreamMessage }
  | { kind: "assistant"; id: string; message?: SDKAssistantMessage; text?: string; streaming?: boolean }
  | { kind: "reasoning"; id: string; steps: string[] }
  | {
      kind: "tool";
      id: string;
      name: string;
      input?: string | null;
      output?: string | null;
      logs?: string[];
      status: "running" | "succeeded" | "failed";
    }
  | { kind: "cli_result"; id: string; command: string; output: string; exitCode: number };

export type ToolTimelineEntry = Extract<TimelineEntry, { kind: "tool" }>;

export type ChatTimelineProps = {
  messages: IndexedMessage[];
  activeSessionId: string | null;
  agentName: string;
  agentStatus?: AgentDisplayStatus;
  partialMessage: string;
  showPartialMessage: boolean;
  partialReasoning?: string;
  reasoningSteps?: ReasoningStep[];
  toolExecutions?: ToolExecution[];
  cliResults?: CliResultMessage[];
  showReasoning?: boolean;
  errorMessage?: string;
};

export type { IndexedMessage };
