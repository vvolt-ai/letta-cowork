import type { SessionView, AgentDisplayStatus } from "../../store/useAppStore";

export type EmailConversationDateFilter = "all" | "today" | "yesterday" | "older";

export type SidebarSessionSummary = Pick<
  SessionView,
  | "id"
  | "title"
  | "status"
  | "updatedAt"
  | "createdAt"
  | "lastPrompt"
  | "isEmailSession"
  | "agentId"
  | "agentName"
> & {
  ephemeralStatus?: AgentDisplayStatus;
};

export interface AgentGroupData {
  agentId: string | undefined;
  agentName: string | undefined;
  sessions: SidebarSessionSummary[];
}

export type SidebarTab = "sessions" | "configuration";

// Re-export from new location for backward compatibility
export type { AutoSyncProcessingMode } from "../email/types";
