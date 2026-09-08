import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { VeraClient } from "./client.js";
import {
  ensureMasterIdentity,
  saveMasterEnrollment,
} from "./master-identity.js";

const cleanup = [];
afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

async function testEnv() {
  const root = await mkdtemp(join(tmpdir(), "letta-vera-master-client-"));
  cleanup.push(root);
  const env = {
    VERA_LETTA_STATE_PATH: join(root, "connection.json"),
    VERA_MASTER_IDENTITY_PATH: join(root, "master-identity.json"),
    VERA_COWORK_ENV_PATH: join(root, "cowork.env"),
    VERA_SERVER_URL: "https://vera.example.com",
  };
  await writeFile(
    env.VERA_COWORK_ENV_PATH,
    "export COWORK_TOKEN=user-access-token\nexport VERA_COWORK_API_URL=https://vera.example.com\n",
    "utf8",
  );
  await ensureMasterIdentity(env);
  await saveMasterEnrollment(
    {
      installationId: "installation-1",
      agentId: "agent-master",
      assignmentId: "assignment-1",
      assignmentRevision: 2,
      enrolledAt: "2026-09-08T07:00:00.000Z",
    },
    env,
  );
  return env;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("VeraClient Master Clio requests", () => {
  test("uses a narrow browser OAuth grant only for enrollment", async () => {
    const env = await testEnv();
    const requests = [];
    const client = new VeraClient({
      env,
      openBrowser: async (authorizationUrl) => {
        const url = new URL(authorizationUrl);
        expect(url.searchParams.get("scope")).toBe("vera:master-enroll");
        const callback = new URL(url.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "enrollment-code");
        callback.searchParams.set("state", url.searchParams.get("state"));
        await fetch(callback);
      },
      fetch: async (url, init = {}) => {
        requests.push({ url: String(url), init });
        const path = new URL(url).pathname;
        if (path === "/.well-known/oauth-authorization-server") {
          return json({
            authorization_endpoint: "https://vera.example.com/authorize",
            token_endpoint: "https://vera.example.com/token",
            registration_endpoint: "https://vera.example.com/register",
            revocation_endpoint: "https://vera.example.com/revoke",
          });
        }
        if (path === "/register") return json({ client_id: "client-1" }, 201);
        if (path === "/token") {
          return json({
            access_token: "enrollment-access-token",
            refresh_token: "enrollment-refresh-token",
            scope: "vera:master-enroll",
          });
        }
        if (path === "/master-agent-auth/installations/enroll") {
          return json({
            installationId: "installation-2",
            assignmentId: "assignment-1",
            assignmentRevision: 2,
            enrolledAt: "2026-09-08T08:00:00.000Z",
          });
        }
        if (path === "/revoke") return new Response(null, { status: 200 });
        return json({ message: "not found" }, 404);
      },
    });

    const enrollment = await client.enrollMasterAgent(
      "agent-master",
      "Developer Mac",
    );

    expect(enrollment.installationId).toBe("installation-2");
    const enrollRequest = requests.find(({ url }) =>
      url.endsWith("/master-agent-auth/installations/enroll"),
    );
    expect(enrollRequest.init.headers.get("authorization")).toBe(
      "Bearer enrollment-access-token",
    );
    expect(requests.filter(({ url }) => url.endsWith("/revoke"))).toHaveLength(2);
  });

  test("uses unauthenticated challenges and only the short-lived master token for access", async () => {
    const env = await testEnv();
    const requests = [];
    const client = new VeraClient({
      env,
      fetch: async (url, init) => {
        requests.push({ url, init });
        const path = new URL(url).pathname;
        if (path === "/master-agent-auth/challenges") {
          return json({ challengeId: "challenge-1", nonce: "nonce-1" });
        }
        if (path === "/master-agent-auth/tokens/exchange") {
          return json({ accessToken: "short-lived-master-token" });
        }
        if (path === "/master-agent-access/organizations") {
          return json([{ id: "organization-1", capabilities: ["agents.read"] }]);
        }
        return json({ message: "not found" }, 404);
      },
    });

    const organizations = await client.listMasterOrganizations("agent-master");

    expect(organizations).toHaveLength(1);
    expect(requests).toHaveLength(3);
    expect(requests[0].init.headers.get("authorization")).toBeNull();
    const challengeRequest = JSON.parse(requests[0].init.body);
    expect(challengeRequest.requestNonce).toBeTruthy();
    expect(challengeRequest.signature).toBeTruthy();
    expect(requests[1].init.headers.get("authorization")).toBeNull();
    const exchange = JSON.parse(requests[1].init.body);
    expect(exchange.agentId).toBe("agent-master");
    expect(exchange.installationId).toBe("installation-1");
    expect(exchange.signature).toBeTruthy();
    expect(requests[2].init.headers.get("authorization")).toBe(
      "Bearer short-lived-master-token",
    );
  });

  test("rejects another runtime agent before making a network request", async () => {
    const env = await testEnv();
    let calls = 0;
    const client = new VeraClient({
      env,
      fetch: async () => {
        calls += 1;
        return json({});
      },
    });

    await expect(client.listMasterOrganizations("agent-other")).rejects.toThrow(
      "does not match",
    );
    expect(calls).toBe(0);
  });
});
