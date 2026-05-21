/**
 * MCP Endpoints
 *
 * REST client for the cowork-server `/mcp` controller. Backs the
 * "MCP Servers" settings page and per-agent attachment UI.
 *
 * Endpoint shapes mirror `src/mcp/mcp.controller.ts` on the server.
 * Secrets (authToken) are write-only: the server returns the config
 * row sanitized (no token field), so the UI must not expect to read
 * the previously-saved token back.
 */

import type { BaseHttpClient } from "../client/base-client.js";

// ─── Wire types ────────────────────────────────────────────────────────────

export type McpTransport = "http" | "sse";

/**
 * Sanitized server row as returned by the controller. authToken and
 * any other encrypted columns are stripped server-side.
 */
export interface McpServer {
  id: string;
  organizationId: string;
  ownerUserId: string | null;
  name: string;
  slug: string;
  transport: McpTransport;
  url: string;
  authHeaderName: string | null;
  customHeaders: Record<string, string> | null;
  enabled: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpTool {
  id: string;
  toolName: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
  enabled: boolean;
  lastRefreshedAt: string | null;
}

export interface McpServerWithTools extends McpServer {
  tools: McpTool[];
}

export interface McpAttachment {
  id: string;
  agentId: string;
  mcpServerId: string;
  /** null = all tools from the server are enabled. Array = whitelist. */
  toolNames: string[] | null;
  createdAt: string;
  server: McpServer | null;
}

export interface CreateMcpServerInput {
  name: string;
  transport: McpTransport;
  url: string;
  auth?: {
    authHeaderName?: string;
    /** Plaintext token. Server encrypts at rest. Never returned by GET. */
    authToken?: string;
    customHeaders?: Record<string, string>;
    /** Plaintext env vars. Server encrypts at rest. Never returned by GET. */
    env?: Record<string, string>;
  };
  enabled?: boolean;
  /** Opt-in org sharing. Omit/false = private to creating user. */
  shareOrgWide?: boolean;
}

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>;

// ─── Endpoint methods ──────────────────────────────────────────────────────

export class McpEndpoints {
  // Server CRUD

  static async listServers(client: BaseHttpClient): Promise<McpServer[]> {
    return client.request<McpServer[]>("/mcp/servers");
  }

  static async getServer(
    client: BaseHttpClient,
    id: string,
  ): Promise<McpServerWithTools> {
    return client.request<McpServerWithTools>(`/mcp/servers/${id}`);
  }

  static async createServer(
    client: BaseHttpClient,
    data: CreateMcpServerInput,
  ): Promise<McpServer> {
    return client.request<McpServer>("/mcp/servers", {
      method: "POST",
      body: data,
    });
  }

  static async updateServer(
    client: BaseHttpClient,
    id: string,
    data: UpdateMcpServerInput,
  ): Promise<McpServer> {
    return client.request<McpServer>(`/mcp/servers/${id}`, {
      method: "PATCH",
      body: data,
    });
  }

  static async deleteServer(
    client: BaseHttpClient,
    id: string,
  ): Promise<void> {
    await client.request(`/mcp/servers/${id}`, { method: "DELETE" });
  }

  /**
   * Force a re-discovery of tools against the upstream server.
   * Synchronous — returns the fresh tool list.
   */
  static async refreshTools(
    client: BaseHttpClient,
    id: string,
  ): Promise<McpTool[]> {
    const response = await client.request<McpTool[] | { ok: boolean; tools?: McpTool[]; error?: string }>(`/mcp/servers/${id}/refresh`, {
      method: "POST",
    });
    if (Array.isArray(response)) return response;
    if (response.ok) return response.tools ?? [];
    throw new Error(response.error ?? "Failed to refresh MCP tools");
  }

  /** Quick connection-only health check. */
  static async testServer(
    client: BaseHttpClient,
    id: string,
  ): Promise<{ ok: boolean; error?: string }> {
    return client.request<{ ok: boolean; error?: string }>(
      `/mcp/servers/${id}/test`,
      { method: "POST" },
    );
  }

  // Agent attachments

  static async listAttachments(
    client: BaseHttpClient,
    agentId: string,
  ): Promise<McpAttachment[]> {
    return client.request<McpAttachment[]>(
      `/mcp/agents/${agentId}/attachments`,
    );
  }

  /**
   * Attach (or upsert) an MCP server onto an agent. Pass `toolNames:
   * null` to enable every tool the server exposes, or an explicit
   * whitelist.
   */
  static async attach(
    client: BaseHttpClient,
    agentId: string,
    mcpServerId: string,
    toolNames: string[] | null,
  ): Promise<McpAttachment> {
    return client.request<McpAttachment>(
      `/mcp/agents/${agentId}/attachments`,
      {
        method: "POST",
        body: { mcpServerId, toolNames },
      },
    );
  }

  static async updateAttachment(
    client: BaseHttpClient,
    agentId: string,
    mcpServerId: string,
    toolNames: string[] | null,
  ): Promise<McpAttachment> {
    return client.request<McpAttachment>(
      `/mcp/agents/${agentId}/attachments/${mcpServerId}`,
      {
        method: "PATCH",
        body: { toolNames },
      },
    );
  }

  static async detach(
    client: BaseHttpClient,
    agentId: string,
    mcpServerId: string,
  ): Promise<void> {
    await client.request(
      `/mcp/agents/${agentId}/attachments/${mcpServerId}`,
      { method: "DELETE" },
    );
  }

  /**
   * The wire-format tool list (namespaced names + JSON schemas) for
   * an agent. Useful for previewing what tools Letta will see before
   * starting a session.
   */
  static async listToolsForAgent(
    client: BaseHttpClient,
    agentId: string,
  ): Promise<
    Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  > {
    return client.request<
      Array<{ name: string; description: string; parameters: Record<string, unknown> }>
    >(`/mcp/agents/${agentId}/tools`);
  }

  /** Diagnostic: MCP-provided Bash env keys for an agent. Values are never returned. */
  static async listEnvKeysForAgent(
    client: BaseHttpClient,
    agentId: string,
  ): Promise<{ agentId: string; keys: string[] }> {
    return client.request<{ agentId: string; keys: string[] }>(
      `/mcp/agents/${agentId}/env-keys`,
    );
  }
}
