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

function masterAgentPath(organizationId, agentId) {
  const base = `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/agents`;
  return agentId ? `${base}/${encodeURIComponent(agentId)}` : base;
}

const MASTER_GIT_ARGUMENTS = [
  "operation",
  "paths",
  "message",
  "branch",
  "ref",
  "tag",
  "mode",
  "source",
  "destination",
  "abortOperation",
  "stashAction",
  "stashRef",
  "staged",
  "rebase",
  "force",
  "forceWithLease",
  "includeIgnored",
  "includeUntracked",
  "recursive",
  "confirm",
  "maxCount",
  "timeoutMs",
];

function masterGitBody(args) {
  return Object.fromEntries(
    MASTER_GIT_ARGUMENTS.filter((key) => args[key] !== undefined).map((key) => [key, args[key]]),
  );
}

async function masterRequest(client, ctx, method, path, body) {
  const agentId = runtimeAgentId(ctx);
  return formatJson(
    await client.requestAsMaster(path, agentId, {
      method,
      body,
      signal: ctx.signal,
    }),
  );
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
          const query = String(ctx.args.query ?? "")
            .trim()
            .toLowerCase();
          const includeSchemas = ctx.args.includeSchemas === true;
          const limit = Math.min(
            200,
            Math.max(1, Number.parseInt(String(ctx.args.limit ?? 50), 10) || 50),
          );
          const allTools = await client.listMcpTools(ctx.signal);
          const matching = allTools.filter((tool) => {
            if (!query) return true;
            return `${tool.name || ""} ${tool.description || ""}`.toLowerCase().includes(query);
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
            throw new Error("The requested MCP tool is not available to the connected Vera user");
          }
          return normalizeMcpResult(await client.invokeMcpTool(toolName, args, ctx.signal));
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
          const provider = String(ctx.args.provider ?? "")
            .trim()
            .toLowerCase();
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
      name: "vera_list_organization_agents",
      description:
        "List same-organization agents published to the connected Vera member. This uses normal Vera user authorization and does not require Master Clio enrollment.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const agents = await client.listOrganizationAgents(ctx.signal);
          return formatJson({ agents, total: agents.length });
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_delegate_to_organization_agent",
      description:
        "Delegate work to an agent published to the connected Vera member's organization. Use vera_list_organization_agents first. This does not require Master Clio enrollment and always requires human approval.",
      parameters: {
        type: "object",
        properties: {
          agentId: {
            type: "string",
            description: "Agent ID returned by vera_list_organization_agents.",
          },
          description: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            description: "Short task description.",
          },
          prompt: {
            type: "string",
            minLength: 1,
            maxLength: 500000,
            description: "Complete task instructions to send to the agent.",
          },
        },
        required: ["agentId", "description", "prompt"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        try {
          return formatJson(
            await client.delegateToOrganizationAgent(
              {
                agentId: requiredString(ctx.args.agentId, "agentId"),
                description: requiredString(ctx.args.description, "description"),
                prompt: requiredString(ctx.args.prompt, "prompt"),
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
          return formatJson(await client.listMasterOrganizations(agentId, ctx.signal));
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
            description: "Organization UUID returned by vera_master_list_accessible_organizations.",
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
          const organizationId = requiredString(ctx.args.organizationId, "organizationId");
          return formatJson(
            await client.listMasterOrganizationAgents(agentId, organizationId, ctx.signal),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  const organizationAgentFields = {
    organizationId: {
      type: "string",
      description: "Organization UUID returned by vera_master_list_accessible_organizations.",
    },
    agentId: {
      type: "string",
      description: "Target agent ID returned by vera_master_list_organization_agents.",
    },
  };
  const confirmedMutation = {
    type: "boolean",
    enum: [true],
    description: "Must be true after reviewing the requested mutation.",
  };

  const masterAgentTools = [
    {
      name: "vera_master_get_organization_agent",
      description:
        "Read one agent through a granted organization's Letta connection. Requires agents.read for the target agent.",
      parameters: {
        type: "object",
        properties: organizationAgentFields,
        required: ["organizationId", "agentId"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        return masterRequest(client, ctx, "GET", masterAgentPath(organizationId, agentId));
      },
    },
    {
      name: "vera_master_create_organization_agent",
      description:
        "Create an agent through a granted organization's Letta connection. Requires an organization-wide agents.manage grant and human approval.",
      parameters: {
        type: "object",
        properties: {
          organizationId: organizationAgentFields.organizationId,
          name: { type: "string", minLength: 1, maxLength: 255 },
          model: { type: "string", minLength: 1, maxLength: 512 },
          description: { type: "string", maxLength: 4096 },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "name", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        return masterRequest(client, ctx, "POST", masterAgentPath(organizationId), {
          name: requiredString(ctx.args.name, "name"),
          ...(ctx.args.model !== undefined ? { model: ctx.args.model } : {}),
          ...(ctx.args.description !== undefined ? { description: ctx.args.description } : {}),
          confirm: ctx.args.confirm === true,
        });
      },
    },
    {
      name: "vera_master_update_organization_agent",
      description:
        "Update an approved agent's name, model, or description. Read the agent first and supply its current updated_at value. Requires agents.manage and human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          name: { type: "string", minLength: 1, maxLength: 255 },
          model: { type: "string", minLength: 1, maxLength: 512 },
          description: { type: "string", maxLength: 4096 },
          expectedUpdatedAt: { type: "string", minLength: 1, maxLength: 128 },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "agentId", "expectedUpdatedAt", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        return masterRequest(client, ctx, "PATCH", masterAgentPath(organizationId, agentId), {
          ...(ctx.args.name !== undefined ? { name: ctx.args.name } : {}),
          ...(ctx.args.model !== undefined ? { model: ctx.args.model } : {}),
          ...(ctx.args.description !== undefined ? { description: ctx.args.description } : {}),
          expectedUpdatedAt: requiredString(ctx.args.expectedUpdatedAt, "expectedUpdatedAt"),
          confirm: ctx.args.confirm === true,
        });
      },
    },
    {
      name: "vera_master_delete_organization_agent",
      description:
        "Permanently delete an approved organization agent. Read the agent first and supply its current updated_at value. Requires agents.manage, confirm=true, and human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          expectedUpdatedAt: { type: "string", minLength: 1, maxLength: 128 },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "agentId", "expectedUpdatedAt", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        return masterRequest(client, ctx, "DELETE", masterAgentPath(organizationId, agentId), {
          expectedUpdatedAt: requiredString(ctx.args.expectedUpdatedAt, "expectedUpdatedAt"),
          confirm: ctx.args.confirm === true,
        });
      },
    },
    {
      name: "vera_master_get_agent_instructions",
      description:
        "Read an approved organization agent's system instructions and concurrency hash. Requires instructions.read.",
      parameters: {
        type: "object",
        properties: organizationAgentFields,
        required: ["organizationId", "agentId"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        return masterRequest(
          client,
          ctx,
          "GET",
          `${masterAgentPath(organizationId, agentId)}/instructions`,
        );
      },
    },
    {
      name: "vera_master_update_agent_instructions",
      description:
        "Replace an approved organization agent's system instructions using the current SHA-256 hash. Protected Vera-marked layers cannot be changed. Requires instructions.write and human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          system: { type: "string", minLength: 1, maxLength: 500000 },
          expectedSha256: {
            type: "string",
            pattern: "^[a-fA-F0-9]{64}$",
          },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "agentId", "system", "expectedSha256", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        return masterRequest(
          client,
          ctx,
          "PUT",
          `${masterAgentPath(organizationId, agentId)}/instructions`,
          {
            system: requiredString(ctx.args.system, "system"),
            expectedSha256: requiredString(ctx.args.expectedSha256, "expectedSha256"),
            confirm: ctx.args.confirm === true,
          },
        );
      },
    },
    {
      name: "vera_master_list_agent_memory",
      description:
        "List core-memory blocks for an approved organization agent. Requires memory.read.",
      parameters: {
        type: "object",
        properties: organizationAgentFields,
        required: ["organizationId", "agentId"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        return masterRequest(
          client,
          ctx,
          "GET",
          `${masterAgentPath(organizationId, agentId)}/memory`,
        );
      },
    },
    {
      name: "vera_master_get_agent_memory_block",
      description:
        "Read one core-memory block and its concurrency hash for an approved organization agent. Requires memory.read.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          label: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            pattern: "^[A-Za-z0-9_.-]+$",
          },
        },
        required: ["organizationId", "agentId", "label"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        const label = requiredString(ctx.args.label, "label");
        return masterRequest(
          client,
          ctx,
          "GET",
          `${masterAgentPath(organizationId, agentId)}/memory/${encodeURIComponent(label)}`,
        );
      },
    },
    {
      name: "vera_master_update_agent_memory_block",
      description:
        "Replace one core-memory block using its current SHA-256 hash. Requires memory.write and human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          label: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            pattern: "^[A-Za-z0-9_.-]+$",
          },
          value: { type: "string", maxLength: 500000 },
          expectedSha256: {
            type: "string",
            pattern: "^[a-fA-F0-9]{64}$",
          },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "agentId", "label", "value", "expectedSha256", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        const label = requiredString(ctx.args.label, "label");
        return masterRequest(
          client,
          ctx,
          "PUT",
          `${masterAgentPath(organizationId, agentId)}/memory/${encodeURIComponent(label)}`,
          {
            value: String(ctx.args.value ?? ""),
            expectedSha256: requiredString(ctx.args.expectedSha256, "expectedSha256"),
            confirm: ctx.args.confirm === true,
          },
        );
      },
    },
    {
      name: "vera_master_git_read",
      description:
        "Run a read-only Git operation against a repository key allowed by the organization's git.read grant.",
      parameters: {
        type: "object",
        properties: {
          organizationId: organizationAgentFields.organizationId,
          repositoryKey: {
            type: "string",
            description:
              "Repository key returned in the organization's allowedRepositoryKeys grant.",
          },
          operation: {
            type: "string",
            enum: [
              "ensure_checkout",
              "status",
              "diff",
              "log",
              "show",
              "branches",
              "tags",
              "remote_info",
            ],
          },
          paths: { type: "array", items: { type: "string" } },
          ref: { type: "string" },
          staged: { type: "boolean" },
          maxCount: { type: "integer", minimum: 1, maximum: 200 },
          timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
        },
        required: ["organizationId", "repositoryKey", "operation"],
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const repositoryKey = requiredString(ctx.args.repositoryKey, "repositoryKey");
        return masterRequest(
          client,
          ctx,
          "POST",
          `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/repositories/${encodeURIComponent(repositoryKey)}/git`,
          masterGitBody(ctx.args),
        );
      },
    },
    {
      name: "vera_master_git_write",
      description:
        "Run a mutating Git operation against a repository key allowed by the organization's git.write grant. Requires confirm=true and human approval.",
      parameters: {
        type: "object",
        properties: {
          organizationId: organizationAgentFields.organizationId,
          repositoryKey: {
            type: "string",
            description:
              "Repository key returned in the organization's allowedRepositoryKeys grant.",
          },
          operation: {
            type: "string",
            enum: [
              "fetch",
              "pull",
              "add",
              "commit",
              "push",
              "push_tag",
              "checkout",
              "create_branch",
              "delete_branch",
              "merge",
              "rebase",
              "reset",
              "revert",
              "cherry_pick",
              "abort",
              "restore",
              "remove",
              "move",
              "stash",
              "tag",
              "delete_tag",
              "delete_remote_tag",
              "clean",
            ],
          },
          paths: { type: "array", items: { type: "string" } },
          message: { type: "string", maxLength: 10000 },
          branch: { type: "string" },
          ref: { type: "string" },
          tag: { type: "string" },
          mode: { type: "string", enum: ["soft", "mixed", "hard"] },
          source: { type: "string" },
          destination: { type: "string" },
          abortOperation: {
            type: "string",
            enum: ["merge", "rebase", "cherry_pick"],
          },
          stashAction: {
            type: "string",
            enum: ["list", "push", "apply", "pop", "drop"],
          },
          stashRef: { type: "string" },
          staged: { type: "boolean" },
          rebase: { type: "boolean" },
          force: { type: "boolean" },
          forceWithLease: { type: "boolean" },
          includeIgnored: { type: "boolean" },
          includeUntracked: { type: "boolean" },
          recursive: { type: "boolean" },
          confirm: confirmedMutation,
          maxCount: { type: "integer", minimum: 1, maximum: 200 },
          timeoutMs: { type: "integer", minimum: 1, maximum: 600000 },
        },
        required: ["organizationId", "repositoryKey", "operation", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const repositoryKey = requiredString(ctx.args.repositoryKey, "repositoryKey");
        return masterRequest(
          client,
          ctx,
          "POST",
          `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/repositories/${encodeURIComponent(repositoryKey)}/git`,
          masterGitBody(ctx.args),
        );
      },
    },
    {
      name: "vera_master_delegate_to_organization_agent",
      description:
        "Delegate a prompt to an approved organization agent through a new isolated Letta conversation. Requires delegation.use and human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          description: { type: "string", minLength: 1, maxLength: 120 },
          prompt: { type: "string", minLength: 1, maxLength: 500000 },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "agentId", "description", "prompt", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        return masterRequest(
          client,
          ctx,
          "POST",
          `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/delegations`,
          {
            agentId: requiredString(ctx.args.agentId, "agentId"),
            description: requiredString(ctx.args.description, "description"),
            prompt: requiredString(ctx.args.prompt, "prompt"),
            confirm: ctx.args.confirm === true,
          },
        );
      },
    },
  ];

  for (const definition of masterAgentTools) {
    disposers.push(
      letta.tools.register({
        ...definition,
        async run(ctx) {
          try {
            return await definition.run(ctx);
          } catch (error) {
            return toolError(error);
          }
        },
      }),
    );
  }

  return disposers;
}
