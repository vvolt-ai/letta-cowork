import { getVeraCoworkApiClient } from "../../../api/index.js";
import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from "../types.js";

interface VeraMcpFetchPayload {
  connectors?: Array<{
    name: string;
    slug: string;
    description?: string | null;
  }>;
  server?: {
    name: string;
    slug: string;
    description?: string | null;
  };
  tools?: Array<{
    name: string;
    description?: string | null;
    inputSchema: Record<string, unknown>;
  }>;
  returned?: number;
  totalMatching?: number;
  truncated?: boolean;
}

function namespacedFetchOutput(output: string): string {
  try {
    const payload = JSON.parse(output) as VeraMcpFetchPayload;
    if (Array.isArray(payload.connectors)) {
      return JSON.stringify({
        connectors: payload.connectors,
        instruction:
          "Call VeraMcpListTools again with one connector's serverSlug to retrieve its tool descriptions and input schemas.",
      }, null, 2);
    }

    const server = payload.server;
    if (!server?.slug || !Array.isArray(payload.tools)) return output;
    return JSON.stringify({
      server,
      tools: payload.tools.map((tool) => ({
        name: `${server.slug}__${tool.name}`,
        nativeName: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema,
      })),
      returned: payload.returned ?? payload.tools.length,
      totalMatching: payload.totalMatching ?? payload.tools.length,
      truncated: payload.truncated === true,
      instruction:
        "Call VeraMcpCallTool with the exact namespaced name and args matching its parameters schema.",
    }, null, 2);
  } catch {
    return output;
  }
}

/**
 * Database-backed MCP discovery. Vera owns connector visibility, persisted tool
 * definitions, credentials, and invocation; Cowork exposes only this fixed
 * discovery tool and the fixed VeraMcpCallTool execution bridge.
 */
const veraMcpListTools: ClientToolDefinition = {
  name: "VeraMcpListTools",
  description:
    "List visible Vera MCP connectors, or fetch enabled tool names, descriptions, and JSON input schemas for one connector. Use this before VeraMcpCallTool when you do not already know the exact namespaced tool and args.",
  parameters: {
    type: "object",
    properties: {
      serverSlug: {
        type: "string",
        description: "Optional connector slug returned by this tool. Omit it to list connectors.",
      },
      query: {
        type: "string",
        description: "Optional case-insensitive tool-name/description filter used with serverSlug.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Maximum tool definitions to return. Defaults to 20.",
      },
    },
    additionalProperties: false,
  },
  async run(args: Record<string, unknown>, _ctx: ToolRunContext): Promise<ToolRunResult> {
    const input = {
      serverSlug: typeof args.serverSlug === "string" && args.serverSlug.trim()
        ? args.serverSlug.trim()
        : undefined,
      query: typeof args.query === "string" && args.query.trim()
        ? args.query.trim()
        : undefined,
      limit: typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(50, Math.floor(args.limit)))
        : undefined,
    };

    try {
      const result = await getVeraCoworkApiClient().mcpFetchVisibleTools(input);
      return {
        isError: Boolean(result.isError),
        output: result.isError ? result.output : namespacedFetchOutput(result.output ?? ""),
      };
    } catch (error) {
      return {
        isError: true,
        output: `Failed to fetch Vera MCP tools: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

const veraMcpCallTool: ClientToolDefinition = {
  name: "VeraMcpCallTool",
  description:
    "Call an MCP tool whose configuration and secrets are stored on Vera server. First use VeraMcpListTools to find the exact namespaced toolName and input schema, then pass toolName and args here.",
  parameters: {
    type: "object",
    properties: {
      toolName: {
        type: "string",
        description: "Exact Vera MCP namespaced tool name, for example '<server_slug>__<tool_name>'.",
      },
      args: {
        type: "object",
        description: "JSON arguments matching the parameters schema returned by VeraMcpListTools.",
        additionalProperties: true,
      },
    },
    required: ["toolName"],
    additionalProperties: false,
  },
  async run(args: Record<string, unknown>, _ctx: ToolRunContext): Promise<ToolRunResult> {
    const toolName = typeof args.toolName === "string" ? args.toolName.trim() : "";
    if (!toolName) {
      return { isError: true, output: "toolName is required." };
    }

    const toolArgs = args.args && typeof args.args === "object" && !Array.isArray(args.args)
      ? (args.args as Record<string, unknown>)
      : {};

    try {
      const result = await getVeraCoworkApiClient().mcpInvokeVisibleTool(toolName, toolArgs);
      return {
        isError: Boolean(result.isError),
        output: result.output ?? "",
      };
    } catch (error) {
      return {
        isError: true,
        output: `Failed to run Vera MCP tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

export const veraMcpTools: ClientToolDefinition[] = [
  veraMcpListTools,
  veraMcpCallTool,
];
