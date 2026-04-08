/**
 * Letta client creation and management.
 */

import { Letta } from "@letta-ai/letta-client";
import { debug } from "./logger.js";

/**
 * Create a Letta client for direct server communication.
 * Used for cancel operations and other API calls.
 */
export function createLettaClient(): Letta | null {
  try {
    const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
    const apiKey = (process.env.LETTA_API_KEY || "").trim();
    if (!apiKey) return null;
    return new Letta({
      baseURL,
      apiKey: apiKey || null,
    });
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
export async function getAgentName(agentId: string | null | undefined): Promise<string | undefined> {
  if (!agentId) return undefined;

  // Return cached name if available for this specific agentId
  const cachedName = agentNameCache.get(agentId);
  if (cachedName) {
    debug("getAgentName: using cached name", { agentId, cachedName });
    return cachedName;
  }

  debug("getAgentName: fetching from API", { agentId });
  try {
    // Dynamic import to avoid circular dependency
    const { getLettaAgent } = await import("../../services/agents/index.js");
    const agent = await getLettaAgent(agentId);
    if (agent) {
      agentNameCache.set(agentId, agent.name);
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
