/**
 * Agent Endpoints
 * 
 * Note: Agent-related endpoints are available via the Letta API directly 
 * (see express.ts for Letta API integration). This module provides a 
 * placeholder for future agent-related functionality via the Vera Cowork server.
 */

import type { BaseHttpClient } from "../client/base-client.js";

/**
 * Agent Endpoints Mixin
 * 
 * Provides agent-related API methods when mixed with BaseHttpClient.
 */
export class AgentEndpoints {
  /**
   * Get agent details from Letta API
   * Note: This is a placeholder - actual Letta API calls are in express.ts
   */
  static async getAgent(client: BaseHttpClient, agentId: string): Promise<unknown> {
    return client.request(`/agents/${agentId}`);
  }

  /**
   * List agents
   * Note: This is a placeholder - actual Letta API calls are in express.ts
   */
  static async listAgents(client: BaseHttpClient): Promise<unknown[]> {
    return client.request<unknown[]>('/agents');
  }
}
