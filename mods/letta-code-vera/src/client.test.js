import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { accessTokenIsFresh, VeraClient } from "./client.js";
import { readState, writeState } from "./state.js";

const cleanup = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function testEnv() {
  const root = await mkdtemp(join(tmpdir(), "letta-vera-client-"));
  cleanup.push(root);
  return {
    VERA_LETTA_STATE_PATH: join(root, "connection.json"),
    VERA_COWORK_ENV_PATH: join(root, "cowork.env"),
    VERA_SERVER_URL: "https://vera.example.com",
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function jwt(expiresAtSeconds) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp: expiresAtSeconds })}.signature`;
}

describe("VeraClient", () => {
  test("performs staged email OTP login and authenticates capability requests", async () => {
    const env = await testEnv();
    const requests = [];
    const accessToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    const fetch = async (url, init) => {
      requests.push({ url, init });
      const path = new URL(url).pathname;
      if (path === "/auth/otp/request") return json({ success: true });
      if (path === "/auth/otp/verify") {
        return json({
          accessToken,
          refreshToken: "refresh-1",
          user: { email: "user@verivolt.com" },
          currentOrganization: { name: "Verivolt" },
        });
      }
      if (path === "/mcp/tools") {
        return json([{ name: "odoo__search", description: "Search Odoo", parameters: {} }]);
      }
      return json({ message: "not found" }, 404);
    };
    const client = new VeraClient({ env, fetch });

    await client.requestOtp("User@Verivolt.com");
    expect((await readState(env)).pendingEmail).toBe("user@verivolt.com");

    const auth = await client.verifyOtp("123456");
    expect(auth.refreshToken).toBe("refresh-1");
    expect((await readState(env)).pendingEmail).toBeNull();

    const tools = await client.listMcpTools();
    expect(tools[0].name).toBe("odoo__search");
    expect(requests.at(-1).init.headers.get("authorization")).toBe(
      `Bearer ${accessToken}`,
    );
    expect(JSON.parse(requests[0].init.body)).toEqual({
      email: "user@verivolt.com",
    });
  });

  test("uses the current token from cowork.env before Letta Code-managed auth", async () => {
    const env = await testEnv();
    await writeFile(
      env.VERA_COWORK_ENV_PATH,
      "export COWORK_TOKEN=cowork-access-token\n",
      "utf8",
    );
    await writeState(
      {
        version: 1,
        serverUrl: "https://vera.example.com",
        pendingEmail: null,
        auth: { accessToken: "local-access-token", refreshToken: "local-refresh-token" },
      },
      env,
    );

    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        return json([]);
      },
    });

    await client.listMcpTools();

    expect(requests).toHaveLength(1);
    expect(requests[0].init.headers.get("authorization")).toBe(
      "Bearer cowork-access-token",
    );
    expect((await client.getConnectionInfo()).source).toBe("cowork");
  });

  test("re-reads cowork.env and retries once when Cowork rotates the token", async () => {
    const env = await testEnv();
    await writeFile(
      env.VERA_COWORK_ENV_PATH,
      "export COWORK_TOKEN=cowork-token-1\n",
      "utf8",
    );

    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (requests.length === 1) {
          await writeFile(
            env.VERA_COWORK_ENV_PATH,
            "export COWORK_TOKEN=cowork-token-2\n",
            "utf8",
          );
          return json({ message: "expired" }, 401);
        }
        return json([]);
      },
    });

    await client.listMcpTools();

    expect(requests).toHaveLength(2);
    expect(requests[0].init.headers.get("authorization")).toBe(
      "Bearer cowork-token-1",
    );
    expect(requests[1].init.headers.get("authorization")).toBe(
      "Bearer cowork-token-2",
    );
  });

  test("does not revoke a Cowork-managed session during Vera disconnect", async () => {
    const env = await testEnv();
    await writeFile(
      env.VERA_COWORK_ENV_PATH,
      "export COWORK_TOKEN=cowork-access-token\n",
      "utf8",
    );
    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        return json({ success: true });
      },
    });

    const result = await client.logout();

    expect(result).toEqual({ coworkManaged: true, hadLocalAuth: false });
    expect(requests).toHaveLength(0);
    expect((await client.getConnectionInfo()).source).toBe("cowork");
  });

  test("rotates an expired access and refresh token before requesting tools", async () => {
    const env = await testEnv();
    const expiredToken = jwt(Math.floor(Date.now() / 1000) - 10);
    const freshToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    await writeState(
      {
        version: 1,
        serverUrl: "https://vera.example.com",
        pendingEmail: null,
        auth: {
          accessToken: expiredToken,
          refreshToken: "refresh-old",
          refreshTokenExpiresAt: null,
          user: null,
          currentOrganization: null,
        },
      },
      env,
    );

    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        const path = new URL(url).pathname;
        if (path === "/auth/refresh") {
          return json({ accessToken: freshToken, refreshToken: "refresh-new" });
        }
        if (path === "/mcp/tools") return json([]);
        return json({}, 404);
      },
    });

    await client.listMcpTools();

    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      "/auth/refresh",
      "/mcp/tools",
    ]);
    expect(JSON.parse(requests[0].init.body)).toEqual({
      refreshToken: "refresh-old",
    });
    expect(requests[1].init.headers.get("authorization")).toBe(
      `Bearer ${freshToken}`,
    );
    expect((await readState(env)).auth.refreshToken).toBe("refresh-new");
  });

  test("logs out with the rotated refresh token and clears local auth", async () => {
    const env = await testEnv();
    await writeState(
      {
        version: 1,
        serverUrl: "https://vera.example.com",
        pendingEmail: null,
        auth: {
          accessToken: jwt(Math.floor(Date.now() / 1000) - 10),
          refreshToken: "refresh-old",
        },
      },
      env,
    );
    const freshToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (new URL(url).pathname === "/auth/refresh") {
          return json({ accessToken: freshToken, refreshToken: "refresh-new" });
        }
        return json({ success: true });
      },
    });

    await client.logout();

    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      "/auth/refresh",
      "/auth/logout",
    ]);
    expect(JSON.parse(requests[1].init.body)).toEqual({
      refreshToken: "refresh-new",
    });
    expect(requests[1].init.headers.get("authorization")).toBe(
      `Bearer ${freshToken}`,
    );
    expect((await readState(env)).auth).toBeNull();
  });

  test("detects token freshness without exposing claims", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(accessTokenIsFresh(jwt(now + 120), now)).toBe(true);
    expect(accessTokenIsFresh(jwt(now + 20), now)).toBe(false);
    expect(accessTokenIsFresh("opaque-token", now)).toBe(true);
  });

  test("parses MCP tool catalogs larger than the response preview limit", async () => {
    const env = await testEnv();
    await writeFile(
      env.VERA_COWORK_ENV_PATH,
      "export COWORK_TOKEN=cowork-access-token\n",
      "utf8",
    );
    const catalog = Array.from({ length: 163 }, (_, index) => ({
      name: `connector__tool_${index}`,
      description: "Large MCP tool description ".repeat(10),
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
      },
    }));
    expect(JSON.stringify(catalog).length).toBeGreaterThan(20_000);

    const client = new VeraClient({
      env,
      fetch: async () => json(catalog),
    });

    const tools = await client.listMcpTools();

    expect(tools).toHaveLength(163);
    expect(tools.at(-1).name).toBe("connector__tool_162");
  });

  test("uses exact Vera MCP invocation and channel send contracts", async () => {
    const env = await testEnv();
    const accessToken = jwt(Math.floor(Date.now() / 1000) + 3600);
    await writeState(
      {
        version: 1,
        serverUrl: "https://vera.example.com",
        pendingEmail: null,
        auth: { accessToken, refreshToken: "refresh" },
      },
      env,
    );

    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        return json({ ok: true });
      },
    });

    await client.invokeMcpTool("odoo__search", { model: "sale.order" });
    await client.sendChannelMessage("channel-id", {
      to: "recipient",
      content: "Hello",
      conversationId: "thread-id",
    });

    expect(JSON.parse(requests[0].init.body)).toEqual({
      toolName: "odoo__search",
      args: { model: "sale.order" },
    });
    expect(new URL(requests[1].url).pathname).toBe("/channels/channel-id/send");
    expect(JSON.parse(requests[1].init.body)).toMatchObject({
      to: "recipient",
      content: "Hello",
      conversationId: "thread-id",
      toolName: "vera_channel_send",
    });
  });
});
