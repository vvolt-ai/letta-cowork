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
    toolName?: string;
    nativeName?: string;
    serverSlug?: string;
    description?: string | null;
    inputSchema: Record<string, unknown>;
  }>;
  returned?: number;
  totalMatching?: number;
  truncated?: boolean;
  selectionRequired?: boolean;
}

function namespacedFetchOutput(output: string): string {
  try {
    const payload = JSON.parse(output) as VeraMcpFetchPayload;
    if (Array.isArray(payload.connectors)&&!Array.isArray(payload.tools)) {
      return JSON.stringify({
        ...payload,
        connectors: payload.connectors,
        instruction:
          "Call VeraMcpListTools again with one connector's serverSlug to retrieve its tool descriptions and input schemas.",
      }, null, 2);
    }

    const server = payload.server;
    if (!Array.isArray(payload.tools)) return output;
    return JSON.stringify({
      ...payload,
      tools: payload.tools.map((tool) => {
        const serverSlug = tool.serverSlug ?? server?.slug;
        const toolName = tool.toolName ?? (serverSlug && !tool.name.startsWith(`${serverSlug}__`)
          ? `${serverSlug}__${tool.name}` : tool.name);
        return {
          ...tool,
          name: toolName,
          toolName,
          nativeName: tool.nativeName ?? (serverSlug && toolName.startsWith(`${serverSlug}__`)
            ? toolName.slice(serverSlug.length + 2) : tool.name),
          serverSlug,
          description: tool.description ?? "",
          parameters: tool.inputSchema,
        };
      }),
      returned: payload.returned ?? payload.tools.length,
      totalMatching: payload.totalMatching ?? payload.tools.length,
      truncated: payload.truncated === true,
      instruction: payload.selectionRequired
        ? "Confirm the intended connector/account before using an exact returned namespaced name. Discovery suggestions never authorize rerouting."
        : "Call VeraMcpCallTool with the exact returned toolName and schema. Native tools are unprefixed vera_* or neo4j_*; configured connector names remain namespaced. Inspect catalog coverage diagnostics before concluding a capability is unavailable.",
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
    "Discover Vera native, governed graph and configured-connector tools under the signed-in user. Default: all catalogs with coverage diagnostics. Use area=remote for native remote computers, area=email/channels/schedules/knowledge/identity/native/graph, or area=configured_connectors with serverSlug for connectors. Listed tools are not resource access grants; ACLs, agent policy, sharing, confirmation and offline-machine checks still apply. No match is not an access denial. Use exact returned toolName/schema; never infer prod/stage or switch identity after a denial.",
  parameters: {
    type: "object",
    properties: {
      area:{type:'string',enum:['all','native','configured_connectors','remote','channels','email','schedules','knowledge','graph','identity'],description:'Catalog/capability area. Defaults to all, or configured_connectors for an explicit non-native serverSlug.'},
      serverSlug: {
        type: "string",
        description: "Exact configured connector slug, or vera_native/vera_graph. Omit to discover catalogs; area=configured_connectors lists only connectors.",
      },
      query: {
        type: "string",
        description: "Optional server-owned tool search; native or namespaced search input is supported. Does not rewrite invocation names.",
      },
      searchAllConnectors: {
        type: "boolean",
        description: "Search tools across authorized visible connectors. Empty args still lists connectors.",
      },
      offset: {
        type: "integer",
        minimum: 0,
        description: "Pagination offset from nextOffset, using the same search input.",
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
      area: ['all','native','configured_connectors','remote','channels','email','schedules','knowledge','graph','identity'].includes(String(args.area))?args.area as 'all':undefined,
      serverSlug: typeof args.serverSlug === "string" && args.serverSlug.trim()
        ? args.serverSlug.trim()
        : undefined,
      query: typeof args.query === "string" && args.query.trim()
        ? args.query.trim()
        : undefined,
      searchAllConnectors: typeof args.searchAllConnectors === "boolean" ? args.searchAllConnectors : undefined,
      offset: typeof args.offset === "number" && Number.isFinite(args.offset)
        ? Math.max(0, Math.floor(args.offset)) : undefined,
      limit: typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.max(1, Math.min(50, Math.floor(args.limit)))
        : undefined,
    };

    try {
      const result = await getVeraCoworkApiClient().mcpFetchVisibleTools(input,_ctx.signal);
      return {
        isError: Boolean(result.isError),
        output: result.isError ? result.output : namespacedFetchOutput(result.output ?? ""),
      };
    } catch (error) {
      return {
        isError: true,
        output: JSON.stringify({code:'VERA_DISCOVERY_UNAVAILABLE',phase:'discovery',reason:(error as {httpStatus?:number})?.httpStatus===401?'not_authenticated':(error as {httpStatus?:number})?.httpStatus===403?'permission_or_policy_denied':'server_or_network_error',httpStatus:(error as {httpStatus?:number})?.httpStatus,executed:false}),
      };
    }
  },
};

const veraMcpCallTool: ClientToolDefinition = {
  name: "VeraMcpCallTool",
  description:
    "Invoke an exact tool returned by VeraMcpListTools under the signed-in user. Native vera_* tools use /mcp; native neo4j_* use governed /neo4j-mcp; configured tools retain exact connector__tool names. No arbitrary endpoint/identity fallback. Existing server ACL, sharing, agent policy and confirmations remain enforced. Never retry an uncertain send/write; inspect its original receipt.",
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
      const result = await getVeraCoworkApiClient().mcpInvokeVisibleTool(toolName, toolArgs,_ctx.signal);
      return {
        isError: Boolean(result.isError),
        output: result.output ?? "",
      };
    } catch (error) {
      return {
        isError: true,
        output: JSON.stringify({code:'VERA_TOOL_ACCESS_UNCONFIRMED',toolName,phase:'invocation',reason:(error as {httpStatus?:number})?.httpStatus===401?'not_authenticated':(error as {httpStatus?:number})?.httpStatus===403?'permission_or_policy_denied':'server_or_network_error',httpStatus:(error as {httpStatus?:number})?.httpStatus,execution:'unconfirmed',retried:false}),
      };
    }
  },
};

export const veraMcpTools: ClientToolDefinition[] = [
  veraMcpListTools,
  veraMcpCallTool,
];
