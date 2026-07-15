import { describe, expect, test } from "bun:test";
import { isProhibitedEmailAction, registerTools } from "./tools.js";

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
  test("identifies outbound email MCP actions but permits drafting", () => {
    expect(isProhibitedEmailAction("zoho_mail__send_email", {})).toBe(true);
    expect(isProhibitedEmailAction("gmail__users_messages_send", {})).toBe(true);
    expect(
      isProhibitedEmailAction("odoo__call_method", {
        model: "mail.mail",
        method: "send",
      }),
    ).toBe(true);
    expect(
      isProhibitedEmailAction(
        "connector__message_create",
        {},
        "Send an outbound message through Gmail",
      ),
    ).toBe(true);
    expect(isProhibitedEmailAction("zoho_mail__create_draft", {})).toBe(false);
    expect(
      isProhibitedEmailAction("odoo__search", { model: "mail.activity" }),
    ).toBe(false);
  });

  test("blocks generic MCP outbound email before invocation", async () => {
    let invoked = false;
    const tools = registeredTools({
      async listMcpTools() {
        return [
          {
            name: "zoho_mail__send_email",
            description: "Send an email through Zoho Mail",
          },
        ];
      },
      async invokeMcpTool() {
        invoked = true;
        return { ok: true };
      },
    });

    const result = await tools.get("vera_mcp_call_tool").run({
      args: { toolName: "zoho_mail__send_email", args: { to: "user@example.com" } },
      signal: undefined,
    });

    expect(result.status).toBe("error");
    expect(result.content).toContain("cannot send");
    expect(invoked).toBe(false);
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
