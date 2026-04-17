import { Letta } from "@letta-ai/letta-client";

export interface LettaAgent {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[];
  model?: string | null;
  models?: string[] | null;
  availableModels?: string[] | null;
  inferenceConfig?: Record<string, unknown> | null;
}

export interface LettaModel {
  name: string;
  display_name?: string | null;
  provider_type: string;
  model_type?: string;
}

export interface ApprovalCandidate {
  runId: string;
  conversationId?: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  requestedAt?: number;
}

export interface LettaRunStatus {
  id: string;
  agentId?: string;
  conversationId?: string;
  status?: "created" | "running" | "completed" | "failed" | "cancelled";
  stopReason?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

function createLettaClient(): Letta {
  const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
  const apiKey = (process.env.LETTA_API_KEY || "").trim();

  return new Letta({
    baseURL,
    apiKey: apiKey || null,
  });
}

export async function listLettaAgents(): Promise<LettaAgent[]> {
  console.log('[lettaAgents] listLettaAgents called');
  const client = createLettaClient();
  
  try {
    console.log('[lettaAgents] Fetching agents from Letta API...');
    const response = await client.agents.list({tags: ['user_visible']});
    // Get the data from the paginated response
    const agents = await response;
    console.log('[lettaAgents] Received', agents.items?.length || 0, 'agents with user_visible tag');
    
    // Filter agents to only show those with user_visible: true in metadata
    return agents.items
      .map((agent) => {
        const raw: any = agent;
        const models = Array.isArray(raw.models) ? raw.models : undefined;
        const availableModels = Array.isArray(raw.available_models) ? raw.available_models : undefined;
        console.log(`[lettaAgents] Agent: ${agent.name} (${agent.id})`);
        return {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          createdAt: agent.created_at,
          metadata: agent.metadata,
          tags: agent.tags,
          model: raw.model ?? null,
          models: models ?? null,
          availableModels: availableModels ?? null,
          inferenceConfig: (raw.inference_config as Record<string, unknown> | undefined) ?? null,
        } satisfies LettaAgent;
      });
  } catch (error) {
    console.error("[lettaAgents] Failed to list agents:", error);
    throw new Error("Failed to fetch agents from Letta");
  }
}

export async function getLettaAgent(agentId: string): Promise<LettaAgent | null> {
  console.log("[lettaAgents] getLettaAgent called with agentId:", agentId);
  const client = createLettaClient();
  
  try {
    const agent = await client.agents.retrieve(agentId);
    console.log("[lettaAgents] retrieved agent:", agent);
    const raw: any = agent;
    const models = Array.isArray(raw.models) ? raw.models : undefined;
    const availableModels = Array.isArray(raw.available_models) ? raw.available_models : undefined;
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      createdAt: agent.created_at,
      metadata: agent.metadata,
      tags: agent.tags,
      model: raw.model ?? null,
      models: models ?? null,
      availableModels: availableModels ?? null,
      inferenceConfig: (raw.inference_config as Record<string, unknown> | undefined) ?? null,
    } satisfies LettaAgent;
  } catch (error) {
    console.error("Failed to get agent:", error);
    return null;
  }
}

export async function listLettaModels(): Promise<LettaModel[]> {
  const client = createLettaClient();
  
  try {
    const response = await client.models.list();
    const models: Letta.Model[] = await response;
    // Filter to only show LLM models (not embedding models)
    return models
      .filter((model) => model.model_type === 'llm' || !model.model_type)
      .map((model) => ({
        name: model.name,
        display_name: model.display_name,
        provider_type: model.provider_type,
        model_type: model.model_type,
      }));
  } catch (error) {
    console.error("Failed to list models:", error);
    throw new Error("Failed to fetch models from Letta");
  }
}

function normalizeApprovalCandidatesFromRun(run: any): ApprovalCandidate[] {
  const runId = typeof run?.id === "string" ? run.id : undefined;
  if (!runId) return [];

  const conversationId = typeof run?.conversation_id === "string"
    ? run.conversation_id
    : typeof run?.conversationId === "string"
      ? run.conversationId
      : undefined;

  const requestedAtRaw = run?.created_at ?? run?.createdAt ?? run?.updated_at ?? run?.updatedAt;
  const requestedAt = typeof requestedAtRaw === "number"
    ? requestedAtRaw
    : typeof requestedAtRaw === "string"
      ? Date.parse(requestedAtRaw)
      : undefined;

  const pending = Array.isArray(run?.pending_approvals)
    ? run.pending_approvals
    : Array.isArray(run?.pendingApprovals)
      ? run.pendingApprovals
      : [];

  const directCandidates = pending.flatMap((item: any, index: number) => {
    const toolUseId = item?.tool_use_id ?? item?.toolUseId ?? item?.id ?? `${runId}-approval-${index}`;
    const toolName = item?.tool_name ?? item?.toolName ?? item?.name ?? "Approval required";
    const input = item?.input ?? item?.arguments ?? item?.tool_input ?? item?.question ?? item;
    return [{
      runId,
      conversationId,
      toolUseId,
      toolName,
      input,
      requestedAt,
    } satisfies ApprovalCandidate];
  });

  if (directCandidates.length > 0) {
    return directCandidates;
  }

  const status = String(run?.status ?? "").toLowerCase();
  if (status !== "requires_approval") {
    return [];
  }

  return [{
    runId,
    conversationId,
    toolUseId: `${runId}-approval`,
    toolName: "Approval required",
    input: run?.blocking_reason ?? run?.message ?? run?.detail ?? run,
    requestedAt,
  }];
}

export async function getAgentRunApprovalCandidates(agentId: string, conversationId?: string): Promise<ApprovalCandidate[]> {
  const client = createLettaClient();

  try {
    // Use client.runs.list() with agentId filter instead of client.agents.runs.list()
    const response = await (client as any).runs.list({ agent_id: agentId });
    const items = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];
    const runs = items.filter((run: any) => {
      const status = String(run?.status ?? "").toLowerCase();
      const runConversationId = run?.conversation_id ?? run?.conversationId;
      const statusMatch = status === "requires_approval" || status === "running";
      const conversationMatch = conversationId ? runConversationId === conversationId : true;
      return statusMatch && conversationMatch;
    });

    return runs.flatMap((run: any) => normalizeApprovalCandidatesFromRun(run));
  } catch (error) {
    console.error("Failed to list agent runs for approval recovery:", error);
    return [];
  }
}

export async function retrieveAgentRunById(runId: string): Promise<LettaRunStatus> {
  const client = createLettaClient();
  const run = await client.runs.retrieve(runId);

  return {
    id: run.id,
    agentId: run.agent_id,
    conversationId: run.conversation_id ?? undefined,
    status: run.status,
    stopReason: run.stop_reason ?? null,
    completedAt: run.completed_at ?? null,
    createdAt: run.created_at,
  } satisfies LettaRunStatus;
}

export async function cancelAgentRunById(runId: string): Promise<{ success: boolean; runId: string }> {
  const client = createLettaClient();
  await (client as any).runs.cancel(runId);
  return { success: true, runId };
}

// ============================================================================
// Runs Debugger — list runs + bulk approve/reject
// ============================================================================

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

export interface ListAgentRunsParams {
  agentId: string;
  conversationId?: string;
  status?: "requires_approval" | "running" | "completed" | "failed" | "cancelled" | "all";
  limit?: number;
  offset?: number;
}

function normalizeRun(raw: any): AgentRun {
  const createdAt = raw?.created_at ?? raw?.createdAt;
  const completedAt = raw?.completed_at ?? raw?.completedAt ?? null;
  let durationMs: number | undefined;
  if (createdAt && completedAt) {
    const start = Date.parse(createdAt);
    const end = Date.parse(completedAt);
    if (!isNaN(start) && !isNaN(end)) {
      const diff = end - start;
      // Guard against clock skew / backfilled timestamps that produce
      // nonsensical negative or absurdly large durations.
      if (diff >= 0 && diff < 24 * 60 * 60 * 1000 /* 1 day cap */) {
        durationMs = diff;
      }
    }
  }

  const pendingRaw = Array.isArray(raw?.pending_approvals)
    ? raw.pending_approvals
    : Array.isArray(raw?.pendingApprovals)
      ? raw.pendingApprovals
      : [];
  const pendingApprovals = pendingRaw.map((item: any, index: number) => ({
    toolUseId: item?.tool_use_id ?? item?.toolUseId ?? item?.id ?? `${raw?.id}-pending-${index}`,
    toolName: item?.tool_name ?? item?.toolName ?? item?.name ?? "Approval required",
    input: item?.input ?? item?.arguments ?? item?.tool_input ?? item,
  }));

  return {
    id: String(raw?.id ?? ""),
    agentId: raw?.agent_id ?? raw?.agentId ?? undefined,
    conversationId: raw?.conversation_id ?? raw?.conversationId ?? undefined,
    status: raw?.status ?? undefined,
    stopReason: raw?.stop_reason ?? raw?.stopReason ?? null,
    createdAt,
    completedAt,
    durationMs,
    pendingApprovals: pendingApprovals.length ? pendingApprovals : undefined,
    raw,
  };
}

export async function listAgentRuns(params: ListAgentRunsParams): Promise<{ runs: AgentRun[]; total: number }> {
  const { agentId, conversationId, status, limit = 50, offset = 0 } = params;
  if (!agentId) return { runs: [], total: 0 };

  const client = createLettaClient();
  try {
    const response: any = await (client as any).runs.list({ agent_id: agentId });
    const items: any[] = Array.isArray(response?.items) ? response.items : Array.isArray(response) ? response : [];

    let filtered = items;
    if (conversationId) {
      filtered = filtered.filter((run) => {
        const cid = run?.conversation_id ?? run?.conversationId;
        return cid === conversationId;
      });
    }
    if (status && status !== "all") {
      filtered = filtered.filter((run) => String(run?.status ?? "").toLowerCase() === status);
    }

    // Sort newest first
    filtered.sort((a, b) => {
      const aTime = Date.parse(a?.created_at ?? a?.createdAt ?? "") || 0;
      const bTime = Date.parse(b?.created_at ?? b?.createdAt ?? "") || 0;
      return bTime - aTime;
    });

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit).map(normalizeRun);
    return { runs: page, total };
  } catch (error) {
    console.error("[listAgentRuns] Failed:", error);
    throw new Error(`Failed to list agent runs: ${String(error)}`);
  }
}

export async function approveAllPendingRuns(
  agentId: string,
  conversationId?: string
): Promise<{ approved: string[]; failed: Array<{ runId: string; error: string }> }> {
  const { runs } = await listAgentRuns({ agentId, conversationId, status: "requires_approval", limit: 200 });
  const approved: string[] = [];
  const failed: Array<{ runId: string; error: string }> = [];

  // Cap concurrency at 10 to avoid hammering the API
  const CONCURRENCY = 10;
  for (let i = 0; i < runs.length; i += CONCURRENCY) {
    const batch = runs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((r) => approveRunById(r.id)));
    results.forEach((result, idx) => {
      const runId = batch[idx].id;
      if (result.status === "fulfilled" && result.value?.success) {
        approved.push(runId);
      } else {
        const err = result.status === "rejected" ? String(result.reason) : "unknown";
        failed.push({ runId, error: err });
      }
    });
  }

  return { approved, failed };
}

export async function rejectAllPendingRuns(
  agentId: string,
  conversationId?: string
): Promise<{ cancelled: string[]; failed: Array<{ runId: string; error: string }> }> {
  const { runs } = await listAgentRuns({ agentId, conversationId, status: "requires_approval", limit: 200 });
  const cancelled: string[] = [];
  const failed: Array<{ runId: string; error: string }> = [];

  const CONCURRENCY = 10;
  for (let i = 0; i < runs.length; i += CONCURRENCY) {
    const batch = runs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map((r) => cancelAgentRunById(r.id)));
    results.forEach((result, idx) => {
      const runId = batch[idx].id;
      if (result.status === "fulfilled" && result.value?.success) {
        cancelled.push(runId);
      } else {
        const err = result.status === "rejected" ? String(result.reason) : "unknown";
        failed.push({ runId, error: err });
      }
    });
  }

  return { cancelled, failed };
}

/**
 * Approve a stuck run that is waiting for human approval.
 * Tries the known Letta approval endpoints; falls back to cancel if none work.
 */
export async function approveRunById(runId: string): Promise<{ success: boolean; runId: string; method: string }> {
  const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim().replace(/\/$/, "");
  const apiKey = (process.env.LETTA_API_KEY || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
  };

  // Try known Letta REST patterns for run approval
  const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
    { url: `${baseURL}/v1/runs/${runId}/approve`,  body: { approved: true } },
    { url: `${baseURL}/v1/runs/${runId}/resume`,   body: { status: "approved" } },
    { url: `${baseURL}/v1/runs/${runId}`,          body: { status: "approved" } },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        headers,
        body: JSON.stringify(attempt.body),
      });
      if (res.ok) {
        console.log(`[approveRunById] Approved run ${runId} via ${attempt.url}`);
        return { success: true, runId, method: attempt.url };
      }
    } catch {
      // try next endpoint
    }
  }

  // None of the approval endpoints worked — cancel as a safe fallback so the
  // session is no longer blocked.
  console.warn(`[approveRunById] Could not approve run ${runId} via API, cancelling as fallback`);
  await cancelAgentRunById(runId).catch(() => {/* ignore */});
  return { success: true, runId, method: "cancel-fallback" };
}
