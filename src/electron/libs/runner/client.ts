/**
 * Letta client creation and management.
 */

import { Letta } from "@letta-ai/letta-client";

import { createLettaRuntimeClient } from "../../services/letta-runtime/index.js";
import { debug } from "./logger.js";

/**
 * Create a Letta client for direct server communication.
 * Used for cancel operations and other API calls.
 */
export function createLettaClient(connectionId?: string): Letta | null {
  try {
    return createLettaRuntimeClient(connectionId);
  } catch {
    return null;
  }
}

/**
 * Agent name cache keyed by agentId to support multiple agents.
 */
const agentNameCache = new Map<string, string>();

/**
 * Get agent name from agentId (uses cache keyed by agentId).
 */
export async function getAgentName(
  agentId: string | null | undefined,
  connectionId?: string,
): Promise<string | undefined> {
  if (!agentId) return undefined;

  const cacheKey = `${connectionId?.trim() || "__default__"}:${agentId}`;
  // Return cached name if available for this account and agent.
  const cachedName = agentNameCache.get(cacheKey);
  if (cachedName) {
    debug("getAgentName: using cached name", { agentId, cachedName });
    return cachedName;
  }

  debug("getAgentName: fetching from API", { agentId });
  try {
    // Dynamic import to avoid circular dependency
    const { getLettaAgent } = await import("../../services/agents/index.js");
    const agent = await getLettaAgent(agentId, connectionId);
    if (agent) {
      agentNameCache.set(cacheKey, agent.name);
      debug("getAgentName: fetched and cached", { agentId, agentName: agent.name });
      return agent.name;
    }
  } catch (err) {
    console.log("[runner] Failed to get agent name:", err);
  }
  return undefined;
}

/**
 * Get the agent name cache for external access.
 */
export function getAgentNameCache(): Map<string, string> {
  return agentNameCache;
}
