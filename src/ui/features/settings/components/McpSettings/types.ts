/**
 * Renderer-side mirror of the MCP types from
 * src/electron/api/endpoints/mcp.ts.
 *
 * Duplicated here intentionally — `src/ui` and `src/electron` are
 * separate TS projects (different tsconfigs) and cross-imports cause
 * Vite/electron-builder confusion. Keep these in sync with the
 * endpoint file when the schema changes.
 */

export type McpTransport = "http" | "sse";

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

export interface CreateMcpServerInput {
  name: string;
  transport: McpTransport;
  url: string;
  auth?: {
    authHeaderName?: string;
    authToken?: string;
    customHeaders?: Record<string, string>;
    env?: Record<string, string>;
  };
  enabled?: boolean;
  shareOrgWide?: boolean;
}

export type UpdateMcpServerInput = Partial<CreateMcpServerInput>;
