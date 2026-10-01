import { describe, expect, test } from "bun:test";

import { registerTools } from "./tools.js";

function registeredTools(client) {
  const tools = new Map();
  registerTools(
    {
      capabilities: { tools: true },
      tools: {
        register(tool) {
          tools.set(tool.name, tool);
          return () => tools.delete(tool.name);
        },
      },
    },
    client,
  );
  return tools;
}

describe("Vera tools", () => {
  test("discovers guided MCP capability areas with schemas and natural-language aliases", async () => {
    const tools = registeredTools({
      async listMcpTools() {
        return [
          {
            name: "vera_list_email_accounts",
            description: "List connected Zoho accounts",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "vera_search_emails",
            description: "Search a live mailbox",
            parameters: { type: "object", required: ["channelId", "searchKey"] },
          },
          {
            name: "vera_list_remote_machines",
            description: "List online machines in a remote environment",
            parameters: { type: "object", required: ["environmentId"] },
          },
          {
            name: "neo4j_list_instances",
            description: "List visible knowledge-graph instances",
            parameters: { type: "object", properties: {} },
          },
          {
            name: "neo4j_read",
            description: "Run bounded read-only Cypher",
            parameters: { type: "object", required: ["instance", "cypher"] },
          },
          {
            name: "vera_list_accessible_organization_agents",
            description: "List agents currently shared with this member",
            parameters: { type: "object", properties: { scope: { type: "string" } } },
          },
          {
            name: "vera_send_message_to_organization_agent",
            description: "Send a task to an exact agent publication",
            parameters: { type: "object", required: ["publicationId", "message"] },
          },
          {
            name: "salesforce__search_records",
            description: "Search configured CRM records",
            parameters: { type: "object" },
          },
        ];
      },
    });
    const discover = tools.get("vera_mcp_list_tools");

    const email = JSON.parse(
      await discover.run({
        args: { area: "email", includeSchemas: true },
        signal: undefined,
      }),
    );
    expect(email.tools.map((tool) => tool.name)).toEqual([
      "vera_list_email_accounts",
      "vera_search_emails",
    ]);
    expect(email.tools[1].parameters.required).toEqual(["channelId", "searchKey"]);
    expect(email.guidance.workflow[0]).toContain("vera_list_channels");

    const remote = JSON.parse(
      await discover.run({
        args: { query: "remote access", includeSchemas: false },
        signal: undefined,
      }),
    );
    expect(remote.tools.map((tool) => tool.name)).toEqual(["vera_list_remote_machines"]);

    const knowledgeGraph = JSON.parse(
      await discover.run({
        args: { area: "knowledge_graph", includeSchemas: true },
        signal: undefined,
      }),
    );
    expect(knowledgeGraph.tools.map((tool) => tool.name)).toEqual([
      "neo4j_list_instances",
      "neo4j_read",
    ]);
    expect(knowledgeGraph.tools[1].parameters.required).toEqual(["instance", "cypher"]);
    expect(knowledgeGraph.guidance.workflow[0]).toBe("neo4j_list_instances");

    const sharedAgents = JSON.parse(
      await discover.run({
        args: { area: "shared_agents", includeSchemas: true },
        signal: undefined,
      }),
    );
    expect(sharedAgents.tools.map((tool) => tool.name)).toEqual([
      "vera_list_accessible_organization_agents",
      "vera_send_message_to_organization_agent",
    ]);
    expect(sharedAgents.guidance.workflow[0]).toContain("vera_list_accessible_organization_agents");

    const connectors = JSON.parse(
      await discover.run({
        args: { area: "configured_connectors" },
        signal: undefined,
      }),
    );
    expect(connectors.tools.map((tool) => tool.name)).toEqual(["salesforce__search_records"]);
  });

  test("invokes every MCP tool advertised by Vera behind approval", async () => {
    const calls = [];
    const tools = registeredTools({
      async listMcpTools() {
        return [
          {
            name: "zoho_mail__send_email",
            description: "Send an email through Zoho Mail",
          },
        ];
      },
      async invokeMcpTool(toolName, args) {
        calls.push({ toolName, args });
        return { ok: true };
      },
    });
    const invoke = tools.get("vera_mcp_call_tool");

    expect(invoke.approvalPolicy).toBe("ask");
    const result = await invoke.run({
      args: {
        toolName: "zoho_mail__send_email",
        args: { to: "user@example.com" },
      },
      signal: undefined,
    });

    expect(JSON.parse(result)).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        toolName: "zoho_mail__send_email",
        args: { to: "user@example.com" },
      },
    ]);
  });

  test("uses normal Vera user authorization for organization-agent delegation", async () => {
    const calls = [];
    const client = {
      async listAccessibleOrganizationAgents() {
        return {
          summary: { total: 1, trustedMember: 1 },
          agents: [
            {
              publicationId: "publisher-org:agent-specialist",
              organizationId: "publisher-org",
              organizationName: "Publisher",
              agentId: "agent-specialist",
              name: "Specialist",
              grantedThrough: "trusted_member",
            },
          ],
        };
      },
      async sendMessageToOrganizationAgent(input) {
        calls.push(input);
        return { requestId: "request-1", finalText: "canonical done" };
      },
      async listOrganizationAgents() {
        return [{ agentId: "agent-specialist", name: "Specialist" }];
      },
      async delegateToOrganizationAgent(input) {
        calls.push(input);
        return { conversationId: "conversation-1", output: "done" };
      },
    };
    const tools = registeredTools(client);
    const canonicalList = tools.get("vera_list_accessible_organization_agents");
    const canonicalSend = tools.get("vera_send_message_to_organization_agent");
    const list = tools.get("vera_list_organization_agents");
    const delegate = tools.get("vera_delegate_to_organization_agent");

    expect(canonicalSend.approvalPolicy).toBe("ask");
    expect(delegate.approvalPolicy).toBe("ask");
    const canonicalDirectory = JSON.parse(
      await canonicalList.run({
        args: { scope: "trusted_member" },
        signal: undefined,
      }),
    );
    expect(canonicalDirectory.count).toBe(1);
    expect(canonicalDirectory.agents[0].organizationName).toBe("Publisher");
    const canonicalResult = await canonicalSend.run({
      args: {
        publicationId: "publisher-org:agent-specialist",
        message: "Please review this work",
      },
      signal: undefined,
    });
    expect(JSON.parse(canonicalResult).finalText).toBe("canonical done");
    expect(JSON.parse(await list.run({ args: {}, signal: undefined })).total).toBe(1);
    const result = await delegate.run({
      args: {
        agentId: "agent-specialist",
        description: "Review task",
        prompt: "Please review this work",
      },
      signal: undefined,
    });

    expect(JSON.parse(result).output).toBe("done");
    expect(calls).toEqual([
      {
        publicationId: "publisher-org:agent-specialist",
        message: "Please review this work",
      },
      {
        agentId: "agent-specialist",
        description: "Review task",
        prompt: "Please review this work",
      },
    ]);
  });

  test("routes Master agent creation through the trusted runtime identity", async () => {
    const calls = [];
    const tools = registeredTools({
      async requestAsMaster(...args) {
        calls.push(args);
        return { id: "agent-created" };
      },
    });
    const create = tools.get("vera_master_create_organization_agent");

    expect(create.approvalPolicy).toBe("ask");
    const result = await create.run({
      agent: { id: "agent-master" },
      args: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        name: "New agent",
        description: "Created through Master Clio",
        confirm: true,
      },
      signal: undefined,
    });

    expect(JSON.parse(result).id).toBe("agent-created");
    expect(calls).toEqual([
      [
        "/master-agent-access/organizations/11111111-1111-4111-8111-111111111111/agents",
        "agent-master",
        {
          method: "POST",
          body: {
            name: "New agent",
            description: "Created through Master Clio",
            confirm: true,
          },
          signal: undefined,
        },
      ],
    ]);
  });

  test("forwards initial memory blocks during agent creation", async () => {
    const calls = [];
    const tools = registeredTools({
      async requestAsMaster(...args) {
        calls.push(args);
        return { id: "agent-new" };
      },
    });
    const memoryBlocks = [{ label: "guidance", value: "Initial instructions", limit: 5000 }];
    await tools.get("vera_master_create_organization_agent").run({
      agent: { id: "agent-master" },
      args: { organizationId: "org-1", name: "New agent", memoryBlocks, confirm: true },
    });
    expect(calls[0][1]).toBe("agent-master");
    expect(calls[0][2].body.memoryBlocks).toEqual(memoryBlocks);
  });

  test("creates and attaches memory through trusted Master identity and versioned routes", async () => {
    const calls = [];
    const tools = registeredTools({
      async requestAsMaster(...args) {
        calls.push(args);
        return { attached: true };
      },
    });
    const common = {
      organizationId: "org-1",
      agentId: "agent-target",
      expectedUpdatedAt: "version-1",
      confirm: true,
    };
    await tools
      .get("vera_master_create_agent_memory_block")
      .run({ agent: { id: "agent-master" }, args: { ...common, label: "guidance", value: "" } });
    await tools.get("vera_master_attach_agent_memory_block").run({
      agent: { id: "agent-master" },
      args: {
        ...common,
        sourceAgentId: "agent-source",
        blockId: "block-11111111-1111-4111-8111-111111111111",
      },
    });
    expect(calls[0][0]).toBe("/master-agent-access/organizations/org-1/agents/agent-target/memory");
    expect(calls[1][0]).toBe(
      "/master-agent-access/organizations/org-1/agents/agent-target/memory/attach",
    );
    for (const call of calls) {
      expect(call[1]).toBe("agent-master");
      expect(call[2].method).toBe("POST");
      expect(call[2].body.expectedUpdatedAt).toBe("version-1");
      expect(call[2].body.confirm).toBe(true);
      expect(call[2].body.organizationId).toBeUndefined();
    }
    expect(calls[0][2].body.value).toBe("");
    expect(calls[1][2].body.sourceAgentId).toBe("agent-source");
  });

  test("marks every Master mutation as approval-gated and dynamically scoped", () => {
    const tools = registeredTools({});
    expect(tools.get("vera_list_organization_agents").isEnabled).toBeUndefined();
    expect(typeof tools.get("vera_master_list_accessible_organizations").isEnabled).toBe(
      "function",
    );
    for (const name of [
      "vera_master_create_organization_agent",
      "vera_master_update_organization_agent",
      "vera_master_delete_organization_agent",
      "vera_master_update_agent_instructions",
      "vera_master_update_agent_memory_block",
      "vera_master_create_agent_memory_block",
      "vera_master_attach_agent_memory_block",
      "vera_master_git_write",
      "vera_master_delegate_to_organization_agent",
    ]) {
      expect(tools.get(name).approvalPolicy).toBe("ask");
      expect(tools.get(name).parallelSafe).toBe(false);
    }
  });

  test("blocks email channels while allowing approved non-email sends", async () => {
    const sent = [];
    const client = {
      async listChannels() {
        return [
          { id: "email-channel", provider: "email" },
          { id: "slack-channel", provider: "slack" },
        ];
      },
      async sendChannelMessage(channelId, input) {
        sent.push({ channelId, input });
        return { id: "message-1", status: "sent" };
      },
    };
    const tools = registeredTools(client);
    const send = tools.get("vera_channel_send");

    const emailResult = await send.run({
      args: {
        channelId: "email-channel",
        to: "user@example.com",
        content: "Do not send",
      },
      signal: undefined,
    });
    expect(emailResult.status).toBe("error");
    expect(sent).toHaveLength(0);

    const slackResult = await send.run({
      args: {
        channelId: "slack-channel",
        to: "C123",
        content: "Hello",
      },
      signal: undefined,
    });
    expect(JSON.parse(slackResult).status).toBe("sent");
    expect(sent).toHaveLength(1);
  });
});
