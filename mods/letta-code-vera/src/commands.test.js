import { describe, expect, test } from "bun:test";

import { registerCommands } from "./commands.js";

function commandRegistry() {
  const commands = new Map();
  return {
    commands,
    api: {
      capabilities: { commands: true },
      commands: {
        register(command) {
          commands.set(command.id, command);
          return () => commands.delete(command.id);
        },
      },
    },
  };
}

describe("Vera commands with Cowork authentication", () => {
  test("reports a Cowork-managed session even when profile lookup fails", async () => {
    const registry = commandRegistry();
    registerCommands(registry.api, {
      getState: async () => ({ auth: null, pendingEmail: null }),
      getConnectionInfo: async () => ({
        connected: true,
        source: "cowork",
        serverUrl: "https://vera.example.com",
        pendingEmail: null,
      }),
      getProfile: async () => {
        throw new Error("profile unavailable");
      },
      listMcpTools: async () => [],
      listChannels: async () => [],
    });

    const result = await registry.commands.get("vera-status").run();

    expect(result.success).toBe(true);
    expect(result.output).toContain("Authentication: Cowork session");
    expect(result.output).toContain("MCP tools: 0");
  });

  test("uses browser OAuth by default for a disconnected standalone session", async () => {
    const registry = commandRegistry();
    let browserCalls = 0;
    registerCommands(registry.api, {
      getState: async () => ({
        auth: null,
        pendingEmail: null,
        serverUrl: "https://vera.example.com",
      }),
      getConnectionInfo: async () => ({
        connected: false,
        source: null,
        serverUrl: "https://vera.example.com",
        pendingEmail: null,
      }),
      connectInBrowser: async () => {
        browserCalls += 1;
        return { scope: "vera:mcp" };
      },
      listMcpTools: async () => [{ name: "connector__read" }],
      listChannels: async () => [],
    });

    const result = await registry.commands.get("vera-connect").run({
      argv: [],
      signal: undefined,
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain("browser OAuth");
    expect(result.output).toContain("MCP tools available: 1");
    expect(browserCalls).toBe(1);
  });

  test("does not claim to disconnect a Cowork-owned session", async () => {
    const registry = commandRegistry();
    registerCommands(registry.api, {
      logout: async () => ({ coworkManaged: true, hadLocalAuth: false }),
    });

    const result = await registry.commands.get("vera-disconnect").run();

    expect(result.success).toBe(true);
    expect(result.output).toContain("managed by Cowork");
  });
});
