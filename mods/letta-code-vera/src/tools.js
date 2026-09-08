import { VeraApiError } from "./client.js";
import { runtimeAgentId } from "./master-identity.js";

const MAX_TOOL_OUTPUT_CHARS = 30_000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

const EMAIL_CHANNEL_PROVIDERS = new Set(["email", "gmail"]);

async function assertNonEmailChannel(client, channelId, signal) {
  const channel = (await client.listChannels(signal)).find(
    (candidate) => candidate.id === channelId,
  );
  if (!channel) {
    throw new Error("Channel is not accessible to the connected Vera user");
  }
  if (EMAIL_CHANNEL_PROVIDERS.has(String(channel.provider).toLowerCase())) {
    throw new Error(
      "Agents may draft email content but cannot send, schedule, queue, or transmit email",
    );
  }
  return channel;
}

export function formatJson(value, maxChars = MAX_TOOL_OUTPUT_CHARS) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… output truncated (${text.length - maxChars} characters omitted)`;
}

function toolError(error) {
  const prefix =
    error instanceof VeraApiError && error.status
      ? `Vera HTTP ${error.status}`
      : "Vera integration error";
  return {
    status: "error",
    isError: true,
    content: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
  };
}

function normalizeMcpResult(result) {
  if (isRecord(result) && result.isError === true) {
    return {
      status: "error",
      isError: true,
      content: formatJson(result.output ?? result.content ?? result),
    };
  }
  if (isRecord(result) && typeof result.output === "string") {
    return result.output;
  }
  return formatJson(result);
}

export function registerTools(letta, client) {
  if (!letta.capabilities.tools) return [];
  const disposers = [];

  disposers.push(
    letta.tools.register({
      name: "vera_mcp_list_tools",
      description:
        "List MCP tools available to the connected Vera user. Use this before vera_mcp_call_tool when the exact Vera MCP tool name or parameters are unknown.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Optional case-insensitive name or description filter.",
          },
          includeSchemas: {
            type: "boolean",
            description: "Include JSON parameter schemas. Defaults to false.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 200,
            description: "Maximum tools to return. Defaults to 50.",
          },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const query = String(ctx.args.query ?? "").trim().toLowerCase();
          const includeSchemas = ctx.args.includeSchemas === true;
          const limit = Math.min(
            200,
            Math.max(1, Number.parseInt(String(ctx.args.limit ?? 50), 10) || 50),
          );
          const allTools = await client.listMcpTools(ctx.signal);
          const matching = allTools.filter((tool) => {
            if (!query) return true;
            return `${tool.name || ""} ${tool.description || ""}`
              .toLowerCase()
              .includes(query);
          });
          const tools = matching.slice(0, limit).map((tool) => ({
            name: tool.name,
            description: tool.description || "",
            ...(includeSchemas ? { parameters: tool.parameters ?? {} } : {}),
          }));
          return formatJson({ tools, returned: tools.length, total: matching.length });
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_mcp_call_tool",
      description:
        "Invoke an MCP tool through Vera using the exact namespaced name returned by vera_mcp_list_tools. Vera applies the connected user's organization and connector permissions.",
      parameters: {
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description: "Exact namespaced Vera MCP tool name.",
          },
          args: {
            type: "object",
            description: "Arguments matching the selected tool's JSON schema.",
            additionalProperties: true,
          },
        },
        required: ["toolName"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        try {
          const toolName = requiredString(ctx.args.toolName, "toolName");
          const args = ctx.args.args === undefined ? {} : ctx.args.args;
          if (!isRecord(args)) throw new Error("args must be an object");
          const definition = (await client.listMcpTools(ctx.signal)).find(
            (tool) => tool.name === toolName,
          );
          if (!definition) {
            throw new Error(
              "The requested MCP tool is not available to the connected Vera user",
            );
          }
          return normalizeMcpResult(
            await client.invokeMcpTool(toolName, args, ctx.signal),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_channels_list",
      description:
        "List messaging channels the connected Vera user owns or can access, including provider, channel ID, and active state.",
      parameters: {
        type: "object",
        properties: {
          provider: {
            type: "string",
            description: "Optional provider filter, such as slack, whatsapp, or email.",
          },
          activeOnly: {
            type: "boolean",
            description: "Only return active channels.",
          },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const provider = String(ctx.args.provider ?? "").trim().toLowerCase();
          const channels = (await client.listChannels(ctx.signal)).filter(
            (channel) =>
              (!provider || String(channel.provider).toLowerCase() === provider) &&
              (ctx.args.activeOnly !== true || channel.isActive === true),
          );
          return formatJson({ channels, total: channels.length });
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_channel_history",
      description:
        "Read recent inbound or outbound message logs from a Vera channel that the connected user can access.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "Vera channel UUID." },
          direction: {
            type: "string",
            enum: ["inbound", "outbound"],
            description: "Optional message direction filter.",
          },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          offset: { type: "integer", minimum: 0 },
        },
        required: ["channelId"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const channelId = requiredString(ctx.args.channelId, "channelId");
          return formatJson(
            await client.getChannelMessages(
              channelId,
              {
                direction: ctx.args.direction,
                limit: ctx.args.limit,
                offset: ctx.args.offset,
              },
              ctx.signal,
            ),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_channel_send",
      description:
        "Send a text message through a Vera-managed channel. Always requires human approval before transmission.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "Vera channel UUID." },
          to: {
            type: "string",
            description: "Provider recipient, chat, channel, or thread identifier.",
          },
          content: { type: "string", description: "Message text to send." },
          contentType: { type: "string", description: "Defaults to text." },
          conversationId: {
            type: "string",
            description: "Optional conversation or thread correlation ID.",
          },
        },
        required: ["channelId", "to", "content"],
        additionalProperties: false,
      },
      approvalPolicy: "alwaysAsk",
      parallelSafe: false,
      async run(ctx) {
        try {
          const channelId = requiredString(ctx.args.channelId, "channelId");
          const to = requiredString(ctx.args.to, "to");
          const content = requiredString(ctx.args.content, "content");
          await assertNonEmailChannel(client, channelId, ctx.signal);
          return formatJson(
            await client.sendChannelMessage(
              channelId,
              {
                to,
                content,
                contentType: String(ctx.args.contentType ?? "text"),
                conversationId: String(ctx.args.conversationId ?? "").trim(),
              },
              ctx.signal,
            ),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_channel_send_file",
      description:
        "Upload a local file and send it through a Vera-managed channel. Always requires human approval before transmission.",
      parameters: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "Vera channel UUID." },
          to: { type: "string", description: "Provider recipient or chat identifier." },
          filePath: { type: "string", description: "Absolute local path to the file." },
          fileName: { type: "string", description: "Optional displayed file name." },
          mimeType: { type: "string", description: "Optional MIME type." },
          caption: { type: "string", description: "Optional file caption." },
          conversationId: { type: "string", description: "Optional correlation ID." },
        },
        required: ["channelId", "to", "filePath"],
        additionalProperties: false,
      },
      approvalPolicy: "alwaysAsk",
      parallelSafe: false,
      async run(ctx) {
        try {
          const channelId = requiredString(ctx.args.channelId, "channelId");
          const to = requiredString(ctx.args.to, "to");
          const filePath = requiredString(ctx.args.filePath, "filePath");
          if (!filePath.startsWith("/")) {
            throw new Error("filePath must be an absolute path");
          }
          await assertNonEmailChannel(client, channelId, ctx.signal);
          return formatJson(
            await client.sendChannelFile(
              channelId,
              {
                to,
                filePath,
                fileName: String(ctx.args.fileName ?? "").trim(),
                mimeType: String(ctx.args.mimeType ?? "").trim(),
                caption: String(ctx.args.caption ?? "").trim(),
                conversationId: String(ctx.args.conversationId ?? "").trim(),
              },
              ctx.signal,
            ),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_master_list_accessible_organizations",
      description:
        "List organizations and capability grants available to this exact Master Clio runtime agent. Use before any organization-scoped Master Clio operation.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const agentId = runtimeAgentId(ctx);
          return formatJson(
            await client.listMasterOrganizations(agentId, ctx.signal),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_master_list_organization_agents",
      description:
        "List agents in one organization accessible to this exact Master Clio runtime. The result is filtered by that organization's agent grant.",
      parameters: {
        type: "object",
        properties: {
          organizationId: {
            type: "string",
            description:
              "Organization UUID returned by vera_master_list_accessible_organizations.",
          },
        },
        required: ["organizationId"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const agentId = runtimeAgentId(ctx);
          const organizationId = requiredString(
            ctx.args.organizationId,
            "organizationId",
          );
          return formatJson(
            await client.listMasterOrganizationAgents(
              agentId,
              organizationId,
              ctx.signal,
            ),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  return disposers;
}
