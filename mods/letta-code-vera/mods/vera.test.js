import { describe, expect, test } from "bun:test";

import activate from "./vera.js";

function fakeLetta() {
  const commands = new Map();
  const tools = new Map();
  return {
    commands,
    tools,
    api: {
      capabilities: { commands: true, tools: true },
      commands: {
        register(command) {
          commands.set(command.id, command);
          return () => commands.delete(command.id);
        },
      },
      tools: {
        register(tool) {
          tools.set(tool.name, tool);
          return () => tools.delete(tool.name);
        },
      },
    },
  };
}

describe("Vera mod", () => {
  test("registers native commands and tools and cleans them up", () => {
    const letta = fakeLetta();
    const dispose = activate(letta.api);

    expect([...letta.commands.keys()]).toEqual([
      "vera-connect",
      "vera-status",
      "vera-sync",
      "vera-tools",
      "vera-disconnect",
    ]);
    expect([...letta.tools.keys()]).toEqual([
      "vera_mcp_list_tools",
      "vera_mcp_call_tool",
      "vera_channels_list",
      "vera_channel_history",
      "vera_channel_send",
      "vera_channel_send_file",
    ]);
    expect(letta.commands.get("vera-connect").showInTranscript).toBe(false);
    expect(letta.tools.get("vera_channel_send").approvalPolicy).toBe(
      "alwaysAsk",
    );
    expect(letta.tools.get("vera_channel_send_file").approvalPolicy).toBe(
      "alwaysAsk",
    );

    dispose();
    expect(letta.commands.size).toBe(0);
    expect(letta.tools.size).toBe(0);
  });
});
