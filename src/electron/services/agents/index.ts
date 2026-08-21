import type { Letta } from "@letta-ai/letta-client";
import { getVeraCoworkApiClient } from "../../api/index.js";
import { createLettaRuntimeClient, getLettaRuntimeConfig } from "../letta-runtime/index.js";

export interface LettaConnection {
  id: string;
  scope: "organization" | "personal";
  name: string;
  isDefault: boolean;
  isActive: boolean;
  lettaBaseUrl?: string | null;
}

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
  /** Model handle sent to the conversation runtime (for example, lc-zai/glm-5). */
  name: string;
  /** Provider-local model name retained for legacy selection migration. */
  model_name?: string | null;
  display_name?: string | null;
  provider_type: string;
  provider_name?: string | null;
  provider_category?: "base" | "byok" | null;
  model_type?: string;
}

interface LettaProvider {
  id: string;
  name: string;
  provider_category?: "base" | "byok" | null;
}

export interface LettaConversation {
  id: string;
  agentId: string;
  summary?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastMessageAt?: string | null;
  model?: string | null;
  archived?: boolean;
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

function createLettaClient(connectionId?: string) {
  return createLettaRuntimeClient(connectionId);
}

function getLettaApiConfig(connectionId?: string) {
  return getLettaRuntimeConfig(connectionId);
}

function mapLettaAgent(agent: any): LettaAgent | null {
  const id = agent?.id || agent?.agent_id;
  if (typeof id !== "string" || !id) return null;

  const models = Array.isArray(agent.models) ? agent.models : undefined;
  const availableModels = Array.isArray(agent.available_models) ? agent.available_models : undefined;
  return {
    id,
    name: agent.name || agent.display_name || id,
    description: agent.description ?? null,
    createdAt: agent.created_at ?? null,
    metadata: agent.metadata ?? null,
    tags: Array.isArray(agent.tags) ? agent.tags : undefined,
    model: agent.model ?? null,
    models: models ?? null,
    availableModels: availableModels ?? null,
    inferenceConfig: (agent.inference_config as Record<string, unknown> | undefined) ?? null,
  };
}

async function listOwnedLettaAgents(queryText: string, connectionId?: string): Promise<LettaAgent[]> {
  const client = createLettaClient(connectionId);
  const agents: LettaAgent[] = [];
  const request = client.agents.list({
    limit: 100,
    query_text: queryText || undefined,
  });

  // The SDK async iterator follows every cursor. Reading response.items only
  // returns the first page and silently hides older agents.
  for await (const agent of request) {
    const mapped = mapLettaAgent(agent);
    if (mapped) agents.push(mapped);
  }
  return agents;
}

export async function listSharedLettaAgents(queryText: string, connectionId?: string): Promise<LettaAgent[]> {
  const { baseURL, apiKey, defaultHeaders, fetch: runtimeFetch = fetch } = getLettaApiConfig(connectionId);
  if (!apiKey) return [];

  // The SDK does not yet expose this Cloud endpoint. Keep the configured base
  // URL authoritative while avoiding /v1/v1 for callers that include /v1.
  const apiRoot = baseURL.replace(/\/v1$/, "");
  const agents: LettaAgent[] = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ limit: "100" });
    if (queryText) params.set("queryText", queryText);
    if (after) params.set("after", after);

    const response = await runtimeFetch(`${apiRoot}/v1/shared-agents?${params}`, {
      headers: {
        ...defaultHeaders,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "X-Letta-Source": "vera-cowork",
      },
    });

    // Older/self-hosted Letta deployments may not implement organization
    // sharing. Preserve owned-agent discovery in that specific case.
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Shared agents request failed with status ${response.status}`);
    }

    const body = await response.json() as {
      agents?: unknown[];
      nextCursor?: string | null;
      next_cursor?: string | null;
    };
    if (!Array.isArray(body.agents)) {
      throw new Error("Shared agents response did not include an agents array");
    }

    for (const agent of body.agents) {
      const mapped = mapLettaAgent(agent);
      if (mapped) agents.push(mapped);
    }

    const nextCursor = body.nextCursor ?? body.next_cursor ?? null;
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    after = nextCursor;
  }

  return agents;
}

async function refreshByokProviders(connectionId?: string): Promise<void> {
  const { baseURL, apiKey, defaultHeaders, fetch: runtimeFetch = fetch } = getLettaApiConfig(connectionId);
  if (!apiKey) return;

  const headers = {
    ...defaultHeaders,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Letta-Source": "vera-cowork",
  };

  try {
    const response = await runtimeFetch(`${baseURL}/v1/providers`, { headers });
    if (!response.ok) return;
    const providers = await response.json() as LettaProvider[];
    if (!Array.isArray(providers)) return;

    await Promise.allSettled(
      providers
        .filter((provider) => provider.provider_category === "byok")
        .map((provider) =>
          runtimeFetch(`${baseURL}/v1/providers/${encodeURIComponent(provider.id)}/refresh`, {
            method: "PATCH",
            headers,
          })
        )
    );
  } catch (error) {
    // Provider refresh is best-effort. Older/self-hosted servers may not expose
    // the Cloud BYOK endpoints, but their normal model catalog should still load.
    console.warn(
      "[lettaModels] BYOK provider refresh skipped:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export async function listLettaConnections(): Promise<LettaConnection[]> {
  const api = getVeraCoworkApiClient();
  if (!api.accessToken) return [];
  const connections = await api.request<LettaConnection[]>("/letta/connections");
  return connections.filter((connection) => connection.isActive);
}

export async function listLettaAgents(queryText = "", connectionId?: string): Promise<LettaAgent[]> {
  const normalizedQuery = queryText.trim();
  console.log("[lettaAgents] listLettaAgents called", { queryText: normalizedQuery });

  try {
    console.log("[lettaAgents] Fetching owned and organization-shared agents...");
    const [ownedAgents, sharedAgents] = await Promise.all([
      listOwnedLettaAgents(normalizedQuery, connectionId),
      listSharedLettaAgents(normalizedQuery, connectionId),
    ]);
    const agents = Array.from(
      new Map(
        [...ownedAgents, ...sharedAgents].map((agent) => [agent.id, agent]),
      ).values(),
    );

    console.log("[lettaAgents] Received", {
      owned: ownedAgents.length,
      shared: sharedAgents.length,
      deduplicated: agents.length,
    });
    return agents;
  } catch (error) {
    console.error("[lettaAgents] Failed to list agents:", error);
    throw new Error("Failed to fetch agents from Letta");
  }
}

export async function getLettaAgent(agentId: string, connectionId?: string): Promise<LettaAgent | null> {
  console.log("[lettaAgents] getLettaAgent called with agentId:", agentId);
  const client = createLettaClient(connectionId);
  
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

export function mapLettaModel(model: Letta.Model): LettaModel {
  const raw = model as Letta.Model & {
    handle?: string;
    provider_name?: string | null;
    provider_category?: "base" | "byok" | null;
  };
  const handle = raw.handle?.trim() || raw.name;

  return {
    // The API's `name` is only the provider-local model name (for example,
    // "glm-5"). Conversation model overrides require the fully qualified
    // `handle` (for example, "lc-zai/glm-5"). Using the bare name can resolve
    // to an unconfigured base provider and fail with a misleading 404.
    name: handle,
    model_name: raw.name,
    display_name: raw.display_name,
    provider_type: raw.provider_type,
    provider_name: raw.provider_name,
    provider_category: raw.provider_category,
    model_type: raw.model_type,
  };
}

export async function listLettaModels(connectionId?: string): Promise<LettaModel[]> {
  // Letta Cloud discovers models exposed by BYOK endpoints during refresh.
  // Refresh first so a newly connected OpenAI-compatible provider appears in
  // Cowork's model picker immediately.
  await refreshByokProviders(connectionId);
  const client = createLettaClient(connectionId);
  
  try {
    const response = await client.models.list();
    const models: any[] = await response;
    // Filter to only show LLM models (not embedding models)
    return models
      .filter((model) => model.model_type === 'llm' || !model.model_type)
      .map(mapLettaModel);
  } catch (error) {
    console.error("Failed to list models:", error);
    throw new Error("Failed to fetch models from Letta");
  }
}

export async function listLettaConversations(agentId: string, connectionId?: string): Promise<LettaConversation[]> {
  const client = createLettaClient(connectionId);

  try {
    const response = await client.conversations.list({
      agent_id: agentId,
      archive_status: "unarchived",
      limit: 100,
      order: "desc",
      order_by: "last_message_at",
    } as any);
    const conversations = await response;
    const items = Array.isArray((conversations as any).items)
      ? (conversations as any).items
      : Array.isArray(conversations)
        ? conversations
        : [];

    return items.map((conversation: any) => ({
      id: conversation.id,
      agentId: conversation.agent_id ?? conversation.agentId ?? agentId,
      summary: conversation.summary ?? null,
      createdAt: conversation.created_at ?? conversation.createdAt ?? null,
      updatedAt: conversation.updated_at ?? conversation.updatedAt ?? null,
      lastMessageAt: conversation.last_message_at ?? conversation.lastMessageAt ?? null,
      model: conversation.model ?? null,
      archived: conversation.archived ?? false,
    } satisfies LettaConversation));
  } catch (error) {
    console.error("Failed to list conversations:", error);
    throw new Error("Failed to fetch conversations from Letta");
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

export async function getAgentRunApprovalCandidates(
  agentId: string,
  conversationId?: string,
  connectionId?: string,
): Promise<ApprovalCandidate[]> {
  const client = createLettaClient(connectionId);

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

export async function retrieveAgentRunById(runId: string, connectionId?: string): Promise<LettaRunStatus> {
  const client = createLettaClient(connectionId);
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

export async function cancelAgentRunById(runId: string, connectionId?: string): Promise<{ success: boolean; runId: string }> {
  const client = createLettaClient(connectionId);
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
export async function approveRunById(runId: string, connectionId?: string): Promise<{ success: boolean; runId: string; method: string }> {
  const { baseURL: rawBaseURL, apiKey, defaultHeaders, fetch: runtimeFetch = fetch } = getLettaApiConfig(connectionId);
  const baseURL = rawBaseURL.replace(/\/$/, "");
  const headers: Record<string, string> = {
    ...defaultHeaders,
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  // Try known Letta REST patterns for run approval
  const attempts: Array<{ url: string; body: Record<string, unknown> }> = [
    { url: `${baseURL}/v1/runs/${runId}/approve`,  body: { approved: true } },
    { url: `${baseURL}/v1/runs/${runId}/resume`,   body: { status: "approved" } },
    { url: `${baseURL}/v1/runs/${runId}`,          body: { status: "approved" } },
  ];

  for (const attempt of attempts) {
    try {
      const res = await runtimeFetch(attempt.url, {
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
  await cancelAgentRunById(runId, connectionId).catch(() => {/* ignore */});
  return { success: true, runId, method: "cancel-fallback" };
}
