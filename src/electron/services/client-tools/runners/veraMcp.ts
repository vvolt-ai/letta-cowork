import { getVeraCoworkApiClient } from "../../../api/index.js";
import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from "../types.js";

function requireAgentId(ctx: ToolRunContext): string | null {
  const agentId = ctx.agentId?.trim();
  return agentId || null;
}

function jsonBody(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Lists MCP tools stored/configured on Vera server for the current session's agent.
 *
 * Product model: MCP credentials/config live on Vera server. Cowork exposes these
 * bridge tools locally and delegates MCP discovery/execution to Vera instead of
 * storing secrets in Electron.
 */
const veraMcpListTools: ClientToolDefinition = {
  name: "VeraMcpListTools",
  description:
    "List MCP tools available from Vera server for the current Cowork session. Use this before VeraMcpCallTool when you need an external MCP connector tool stored on Vera server.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async run(_args: Record<string, unknown>, ctx: ToolRunContext): Promise<ToolRunResult> {
    const agentId = requireAgentId(ctx);
    if (!agentId) {
      return {
        isError: true,
        output: "VeraMcpListTools requires a Cowork session agentId. Start or resume a session with a real Letta agent first.",
      };
    }

    try {
      const api = getVeraCoworkApiClient();
      const tools = await api.mcpListToolsForAgent(agentId);
      if (tools.length === 0) {
        return {
          isError: false,
          output:
            "No Vera MCP tools are currently available for this agent. Add/enable MCP servers in Configuration → MCP Servers, refresh tools, and ensure Vera server policy exposes them to this session.",
        };
      }
      return {
        isError: false,
        output: `Vera MCP tools available for agent ${agentId}:\n${jsonBody(tools)}`,
      };
    } catch (error) {
      return {
        isError: true,
        output: `Failed to list Vera MCP tools: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

const veraMcpCallTool: ClientToolDefinition = {
  name: "VeraMcpCallTool",
  description:
    "Call an MCP tool whose configuration and secrets are stored on Vera server. First use VeraMcpListTools to find the exact namespaced toolName, then pass toolName and args here.",
  parameters: {
    type: "object",
    properties: {
      toolName: {
        type: "string",
        description: "Exact Vera MCP namespaced tool name, for example '<server_slug>__<tool_name>'.",
      },
      args: {
        type: "object",
        description: "JSON arguments for the MCP tool.",
        additionalProperties: true,
      },
    },
    required: ["toolName"],
    additionalProperties: false,
  },
  async run(args: Record<string, unknown>, ctx: ToolRunContext): Promise<ToolRunResult> {
    const agentId = requireAgentId(ctx);
    if (!agentId) {
      return {
        isError: true,
        output: "VeraMcpCallTool requires a Cowork session agentId. Start or resume a session with a real Letta agent first.",
      };
    }

    const toolName = typeof args.toolName === "string" ? args.toolName.trim() : "";
    if (!toolName) {
      return { isError: true, output: "toolName is required." };
    }

    const toolArgs = args.args && typeof args.args === "object" && !Array.isArray(args.args)
      ? (args.args as Record<string, unknown>)
      : {};

    try {
      const api = getVeraCoworkApiClient();
      const result = await api.mcpRunToolForAgent(agentId, toolName, toolArgs);
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
