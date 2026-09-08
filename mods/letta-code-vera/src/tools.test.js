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
