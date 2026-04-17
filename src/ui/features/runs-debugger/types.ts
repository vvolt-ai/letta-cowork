export interface AgentRun {
  id: string;
  agentId?: string;
  conversationId?: string;
  status?: "created" | "running" | "completed" | "failed" | "cancelled" | "requires_approval";
  stopReason?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  durationMs?: number;
  pendingApprovals?: Array<{ toolUseId: string; toolName: string; input: unknown }>;
  raw?: unknown;
}

export type RunStatusFilter =
  | "all"
  | "requires_approval"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export const RUN_STATUS_FILTERS: Array<{ value: RunStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "requires_approval", label: "Needs approval" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];
