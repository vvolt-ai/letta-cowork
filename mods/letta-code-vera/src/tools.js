import { VeraApiError } from "./client.js";
import { isEnrolledMasterRuntime, runtimeAgentId } from "./master-identity.js";

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

const MCP_DISCOVERY_AREAS = {
  identity: ["vera_whoami"],
  channels: [
    "vera_list_channels",
    "vera_get_channel_status",
    "vera_create_channel",
    "vera_update_channel",
    "vera_start_channel",
    "vera_stop_channel",
    "vera_send_channel_message",
    "vera_delete_channel",
    "vera_list_channel_shares",
    "vera_share_channel",
    "vera_revoke_channel_share",
  ],
  email: [
    "vera_list_zoho_mail_read_operations",
    "vera_describe_zoho_mail_read_operation",
    "vera_call_zoho_mail_read",
    "vera_list_email_accounts",
    "vera_list_email_folders",
    "vera_list_emails",
    "vera_search_emails",
    "vera_get_email",
    "vera_generate_email_draft",
    "vera_save_email_draft",
    "vera_list_email_attachments",
    "vera_get_email_attachment",
  ],
  responses: ["vera_respond"],
  schedules: [
    "vera_list_schedules",
    "vera_get_schedule",
    "vera_list_schedule_runs",
    "vera_create_schedule",
    "vera_update_schedule",
    "vera_toggle_schedule",
    "vera_delete_schedule",
  ],
  knowledge: ["vera_search_knowledge"],
  knowledge_graph: [
    "neo4j_list_instances",
    "neo4j_get_schema",
    "neo4j_read",
    "neo4j_explain",
    "neo4j_write",
  ],
  organization_agents: [
    "vera_list_accessible_organization_agents",
    "vera_send_message_to_organization_agent",
  ],
  shared_agents: [
    "vera_list_accessible_organization_agents",
    "vera_send_message_to_organization_agent",
  ],
  profiles: [
    "vera_list_profile_shares",
    "vera_create_profile_share",
    "vera_update_profile_share",
    "vera_revoke_profile_share",
  ],
  remote: [
    "vera_list_remote_environments",
    "vera_get_remote_environment",
    "vera_list_remote_machines",
    "vera_run_remote_tool",
  ],
  mcp: ["vera_list_mcp_servers", "vera_get_mcp_server", "vera_refresh_mcp_server_tools"],
  skills: ["vera_list_installed_skills", "vera_list_trusted_skills"],
};

const MCP_DISCOVERY_WORKFLOWS = {
  email: [
    "vera_list_channels (choose provider=email)",
    "vera_list_email_accounts",
    "vera_list_email_folders",
    "vera_list_emails or vera_search_emails",
    "vera_get_email with the returned accountId, folderId, and messageId",
    "vera_list_email_attachments before vera_get_email_attachment",
    "vera_generate_email_draft, then review and optionally vera_save_email_draft with confirm=true; email sending is not supported",
  ],
  channels: [
    "vera_list_channels",
    "vera_get_channel_status",
    "verify the exact channel/provider/recipient",
    "use lifecycle, sharing, or vera_send_channel_message once as requested; email channels cannot send",
  ],
  remote: [
    "vera_list_remote_environments",
    "vera_get_remote_environment",
    "vera_list_remote_machines",
    "select an exact online environmentId and verify capabilities plus allowedDirectories",
    "vera_run_remote_tool with confirm=true; do not blindly retry an ambiguous mutating call",
  ],
  schedules: [
    "vera_list_schedules",
    "vera_get_schedule and vera_list_schedule_runs",
    "create, update, toggle, or delete only when explicitly requested",
  ],
  knowledge_graph: [
    "neo4j_list_instances",
    "select the exact returned instance slug and check effectivePermission plus accessMode",
    "neo4j_get_schema before writing schema-dependent Cypher",
    "neo4j_read with parameters, maxRecords, and a sensible LIMIT",
    "neo4j_explain before a non-trivial or expensive query",
    "neo4j_write only after explicit authorization and when effective access permits it",
  ],
  organization_agents: [
    "vera_list_accessible_organization_agents",
    "select the exact opaque publicationId",
    "vera_send_message_to_organization_agent with the complete task",
  ],
  shared_agents: [
    "vera_list_accessible_organization_agents with the required grant scope",
    "verify publisher organization, grantedThrough, and the exact opaque publicationId",
    "vera_send_message_to_organization_agent with the complete task",
    "wait for the final reply; each send starts a new isolated target-agent conversation",
  ],
  mcp: [
    "vera_list_mcp_servers",
    "vera_get_mcp_server",
    "vera_refresh_mcp_server_tools only when a refresh is requested or discovery is stale",
  ],
};

const MCP_DISCOVERY_QUERY_ALIASES = {
  email: ["email", "mail", "zoho"],
  channels: ["channel", "message", "whatsapp", "slack", "telegram", "discord", "wechat"],
  remote: ["remote", "machine", "environment", "desktop", "runner"],
  schedules: ["schedule", "scheduled", "cron", "run history"],
  knowledge: ["knowledge", "search", "indexed"],
  knowledge_graph: ["knowledge graph", "neo4j", "cypher", "node", "relationship", "graph schema"],
  organization_agents: ["organization agent", "agent communication", "delegate", "publication"],
  shared_agents: [
    "shared agent",
    "share agent",
    "published agent",
    "agent access",
    "publication grant",
  ],
  profiles: ["profile", "share", "sharing"],
  mcp: ["mcp", "connector", "server configuration"],
  skills: ["skill", "installed skill", "trusted skill"],
  identity: ["identity", "whoami", "organization", "role"],
  responses: ["respond", "response", "conversation"],
};

function toolNameEndsWith(toolName, nativeName) {
  return toolName === nativeName || toolName.endsWith(`__${nativeName}`);
}

function toolMatchesArea(tool, area) {
  if (!area || area === "all") return true;
  if (area === "configured_connectors") return String(tool.name).includes("__");
  if ((MCP_DISCOVERY_AREAS[area] ?? []).some((name) => toolNameEndsWith(String(tool.name), name))) {
    return true;
  }
  const searchable = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
  return (MCP_DISCOVERY_QUERY_ALIASES[area] ?? []).some((alias) => searchable.includes(alias));
}

function discoveryTerms(query) {
  const normalized = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const terms = new Set([normalized]);
  for (const [area, aliases] of Object.entries(MCP_DISCOVERY_QUERY_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      for (const alias of aliases) terms.add(alias);
      for (const nativeName of MCP_DISCOVERY_AREAS[area] ?? []) {
        terms.add(nativeName.replace(/^vera_/, "").replaceAll("_", " "));
      }
    }
  }
  return [...terms];
}

function discoveryHelp(area) {
  const workflow = MCP_DISCOVERY_WORKFLOWS[area];
  return {
    ...(workflow ? { workflow } : {}),
    next: "Call vera_mcp_list_tools again with the relevant area and includeSchemas=true, then call vera_mcp_call_tool with the exact returned tool name and schema-matching args.",
    areas: [
      "identity",
      "channels",
      "email",
      "responses",
      "schedules",
      "knowledge",
      "knowledge_graph",
      "organization_agents",
      "shared_agents",
      "profiles",
      "remote",
      "mcp",
      "skills",
      "configured_connectors",
    ],
  };
}

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
        "Discover Vera-native, governed Neo4j, and configured-connector MCP tools available to the connected user. Start with area=email for live mailbox data, area=remote for remote machines, area=channels for channel lifecycle/status, or area=knowledge_graph for Neo4j. Set includeSchemas=true before invoking a tool, then use its exact returned name with vera_mcp_call_tool.",
      parameters: {
        type: "object",
        properties: {
          area: {
            type: "string",
            enum: [
              "all",
              "identity",
              "channels",
              "email",
              "responses",
              "schedules",
              "knowledge",
              "knowledge_graph",
              "organization_agents",
              "shared_agents",
              "profiles",
              "remote",
              "mcp",
              "skills",
              "configured_connectors",
            ],
            description:
              "Optional capability group. Use email, channels, remote, or knowledge_graph instead of guessing tool names. Defaults to all.",
          },
          query: {
            type: "string",
            description:
              "Optional case-insensitive filter. Natural phrases such as 'email data', 'remote access', and 'channel messages' expand to relevant tool aliases.",
          },
          includeSchemas: {
            type: "boolean",
            description:
              "Include JSON parameter schemas. Set true before vera_mcp_call_tool. Defaults to false for compact discovery.",
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
          const area = String(ctx.args.area ?? "all")
            .trim()
            .toLowerCase();
          const terms = discoveryTerms(ctx.args.query);
          const includeSchemas = ctx.args.includeSchemas === true;
          const limit = Math.min(
            200,
            Math.max(1, Number.parseInt(String(ctx.args.limit ?? 50), 10) || 50),
          );
          const allTools = await client.listMcpTools(ctx.signal);
          const matching = allTools.filter((tool) => {
            if (!toolMatchesArea(tool, area)) return false;
            if (terms.length === 0) return true;
            const searchable = `${tool.name || ""} ${tool.description || ""}`.toLowerCase();
            return terms.some((term) => searchable.includes(term));
          });
          const tools = matching.slice(0, limit).map((tool) => ({
            name: tool.name,
            description: tool.description || "",
            ...(includeSchemas ? { parameters: tool.parameters ?? {} } : {}),
          }));
          return formatJson({
            area,
            tools,
            returned: tools.length,
            total: matching.length,
            truncated: matching.length > tools.length,
            guidance: discoveryHelp(area),
          });
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
        "Invoke one Vera-native, governed Neo4j, or configured-connector MCP tool using the exact name and schema returned by vera_mcp_list_tools. Discover with includeSchemas=true first. Vera enforces user, organization, ownership, sharing, and connector permissions; do not bypass a denial. Email is read/draft-only, channel and remote mutations require exact targets, and ambiguous non-idempotent calls must not be retried blindly.",
      parameters: {
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description:
              "Exact tool name returned by vera_mcp_list_tools; native names may be unprefixed and configured tools are typically namespaced.",
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
        "List basic owned/shared channel metadata available to the connected user, including provider, channel ID, and active state. Use this to resolve a channel for history or the dedicated non-email send helpers. For channel status, lifecycle, sharing, or full native capabilities, discover area=channels through vera_mcp_list_tools. For mailbox content, discover area=email instead of using channel history.",
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
        "Read bounded inbound/outbound delivery logs from one accessible Vera channel. This is channel history, not a live email mailbox-body API. For email accounts, folders, search, bodies, and attachments, discover area=email through vera_mcp_list_tools.",
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
        "Send one approved text message through an exact accessible non-email Vera channel. Resolve the channel first, verify provider, recipient/thread, and final content, then call once; retries can duplicate delivery. Email channels are rejected—discover area=email and use the draft-only workflow instead.",
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
        "Upload and send one approved local file through an exact accessible non-email Vera channel. Resolve the channel and recipient first, verify the absolute path, file name/type, caption, and final destination, then call once. Email channels are rejected.",
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
      name: "vera_list_accessible_organization_agents",
      description:
        "List all agents shared or published to the connected Vera member across same and trusted organizations. Returns publisher organization, exact opaque publicationId, and grant scope. Use the exact current publicationId with vera_send_message_to_organization_agent; do not guess it or assume an older grant remains valid.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["all", "organization", "member", "trusted_organization", "trusted_member"],
            description: "Optional grant-scope filter. Defaults to all.",
          },
        },
        additionalProperties: false,
      },
      requiresApproval: false,
      parallelSafe: true,
      async run(ctx) {
        try {
          const scope = String(ctx.args.scope ?? "all");
          const directory = await client.listAccessibleOrganizationAgents(ctx.signal);
          const agents =
            scope === "all"
              ? directory.agents
              : directory.agents.filter((agent) => agent.grantedThrough === scope);
          return formatJson({
            scope,
            summary: directory.summary,
            count: agents.length,
            agents,
          });
        } catch (error) {
          return toolError(error);
        }
      },
    }),
  );

  disposers.push(
    letta.tools.register({
      name: "vera_send_message_to_organization_agent",
      description:
        "Send one bounded message to an agent currently shared or published to the connected Vera member. Use an exact current publicationId from vera_list_accessible_organization_agents. Each call starts an isolated target-agent conversation, waits for its final reply, and always requires human approval; it is not a passive notification or a continuing chat.",
      parameters: {
        type: "object",
        properties: {
          publicationId: {
            type: "string",
            minLength: 1,
            maxLength: 512,
            description:
              "Exact opaque publicationId returned by vera_list_accessible_organization_agents.",
          },
          message: {
            type: "string",
            minLength: 1,
            maxLength: 20000,
            description: "Complete message or task for the target agent.",
          },
        },
        required: ["publicationId", "message"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        try {
          return formatJson(
            await client.sendMessageToOrganizationAgent(
              {
                publicationId: requiredString(ctx.args.publicationId, "publicationId"),
                message: requiredString(ctx.args.message, "message"),
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
        "Compatibility helper: list same- and cross-organization agents shared or published to the connected Vera member, including publisher organization and grant scope. This uses normal Vera user authorization and does not require Master Clio enrollment.",
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
        "Compatibility helper: delegate work to a same- or cross-organization agent shared or published to the connected Vera member. List first and use an exact returned agent ID that resolves to one current publication. Each call is isolated, does not require Master Clio, and always requires human approval.",
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
        "List organizations and capability grants available to this exact Master Clio runtime agent. Hidden from non-enrolled agents. Use before any organization-scoped Master Clio operation.",
      isEnabled: isEnrolledMasterRuntime,
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
        "List agents in one organization accessible to this exact Master Clio runtime. Hidden from non-enrolled agents. The result is filtered by that organization's agent grant.",
      isEnabled: isEnrolledMasterRuntime,
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
  const memoryBlockFields = {
    label: { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9_.-]+$" },
    value: { type: "string", maxLength: 500000 },
    description: { type: "string", maxLength: 4096 },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 500000,
      description: "Character limit; defaults to 5000. Value must fit within it.",
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
        "Create an agent through a granted organization's Letta connection, optionally with initial memoryBlocks created and attached in the same request. Requires an organization-wide agents.manage grant and human approval.",
      parameters: {
        type: "object",
        properties: {
          organizationId: organizationAgentFields.organizationId,
          name: { type: "string", minLength: 1, maxLength: 255 },
          model: { type: "string", minLength: 1, maxLength: 512 },
          description: { type: "string", maxLength: 4096 },
          memoryBlocks: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              properties: memoryBlockFields,
              required: ["label", "value"],
              additionalProperties: false,
            },
            description:
              "Optional initial blocks created and attached as part of agent creation; labels must be unique.",
          },
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
          ...(ctx.args.memoryBlocks !== undefined ? { memoryBlocks: ctx.args.memoryBlocks } : {}),
          confirm: ctx.args.confirm === true,
        });
      },
    },
    {
      name: "vera_master_create_agent_memory_block",
      description:
        "Create and attach a new memory block to an approved agent. Covered by agents.manage; does not permit replacing existing memory values. Read the target agent first and supply its current updated_at. Requires human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          ...memoryBlockFields,
          expectedUpdatedAt: { type: "string", minLength: 1, maxLength: 128 },
          confirm: confirmedMutation,
        },
        required: ["organizationId", "agentId", "label", "value", "expectedUpdatedAt", "confirm"],
        additionalProperties: false,
      },
      approvalPolicy: "ask",
      parallelSafe: false,
      async run(ctx) {
        const organizationId = requiredString(ctx.args.organizationId, "organizationId");
        const agentId = requiredString(ctx.args.agentId, "agentId");
        if (typeof ctx.args.value !== "string") throw new Error("value must be a string");
        return masterRequest(
          client,
          ctx,
          "POST",
          `${masterAgentPath(organizationId, agentId)}/memory`,
          {
            label: requiredString(ctx.args.label, "label"),
            value: ctx.args.value,
            ...(ctx.args.description !== undefined ? { description: ctx.args.description } : {}),
            ...(ctx.args.limit !== undefined ? { limit: ctx.args.limit } : {}),
            expectedUpdatedAt: requiredString(ctx.args.expectedUpdatedAt, "expectedUpdatedAt"),
            confirm: ctx.args.confirm === true,
          },
        );
      },
    },
    {
      name: "vera_master_attach_agent_memory_block",
      description:
        "Attach an existing block from a readable approved source agent in the same organization. Requires agents.manage on the target and memory.read on the source. Use a verified block ID; labels cannot overwrite another block. Read target updated_at first. Requires human approval.",
      parameters: {
        type: "object",
        properties: {
          ...organizationAgentFields,
          sourceAgentId: { type: "string", minLength: 1, maxLength: 255 },
          blockId: { type: "string", pattern: "^block-[a-fA-F0-9-]{36}$" },
          expectedUpdatedAt: { type: "string", minLength: 1, maxLength: 128 },
          confirm: confirmedMutation,
        },
        required: [
          "organizationId",
          "agentId",
          "sourceAgentId",
          "blockId",
          "expectedUpdatedAt",
          "confirm",
        ],
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
          "POST",
          `${masterAgentPath(organizationId, agentId)}/memory/attach`,
          {
            sourceAgentId: requiredString(ctx.args.sourceAgentId, "sourceAgentId"),
            blockId: requiredString(ctx.args.blockId, "blockId"),
            expectedUpdatedAt: requiredString(ctx.args.expectedUpdatedAt, "expectedUpdatedAt"),
            confirm: ctx.args.confirm === true,
          },
        );
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
          `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/repositories/${encodeURIComponent(
            repositoryKey,
          )}/git`,
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
          `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/repositories/${encodeURIComponent(
            repositoryKey,
          )}/git`,
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
        isEnabled: isEnrolledMasterRuntime,
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
