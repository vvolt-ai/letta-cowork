import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { verify } from "node:crypto";

import { afterEach, describe, expect, test } from "bun:test";

import {
  ensureMasterIdentity,
  isEnrolledMasterRuntime,
  masterAssertionPayload,
  readMasterIdentity,
  runtimeAgentId,
  saveMasterEnrollment,
  signMasterAssertion,
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
  const root = await mkdtemp(join(tmpdir(), "letta-vera-master-"));
  cleanup.push(root);
  return {
    VERA_MASTER_IDENTITY_PATH: join(root, "vera", "master-identity.json"),
  };
}

describe("Master Clio local identity", () => {
  test("creates an Ed25519 identity with owner-only file permissions", async () => {
    const env = await testEnv();
    const identity = await ensureMasterIdentity(env);
    const reread = await readMasterIdentity(env);
    const fileMode = (await stat(env.VERA_MASTER_IDENTITY_PATH)).mode & 0o777;

    expect(identity.publicKeyFingerprint).toHaveLength(64);
    expect(identity.privateKeyPem).toContain("PRIVATE KEY");
    expect(reread.publicKeyFingerprint).toBe(identity.publicKeyFingerprint);
    expect(fileMode).toBe(0o600);
  });

  test("signs the exact canonical request assertion", async () => {
    const env = await testEnv();
    const identity = await ensureMasterIdentity(env);
    const assertion = {
      challengeId: "challenge-1",
      nonce: "nonce-1",
      installationId: "installation-1",
      agentId: "agent-master",
      timestamp: "2026-09-08T07:00:00.000Z",
      method: "POST",
      path: "/master-agent-access/organizations",
      bodySha256: "abc123",
    };
    const signature = Buffer.from(
      signMasterAssertion(identity, assertion),
      "base64url",
    );

    expect(
      verify(
        null,
        Buffer.from(masterAssertionPayload(assertion)),
        identity.publicKeyPem,
        signature,
      ),
    ).toBe(true);
  });

  test("enables Master tools only for the exact enrolled runtime agent", async () => {
    const env = await testEnv();
    await ensureMasterIdentity(env);
    await saveMasterEnrollment(
      {
        installationId: "installation-1",
        agentId: "agent-master",
        assignmentId: "assignment-1",
        assignmentRevision: 1,
        serverUrl: "https://vera.example.com",
      },
      env,
    );

    expect(
      isEnrolledMasterRuntime({ agent: { id: "agent-master" } }, env),
    ).toBe(true);
    expect(
      isEnrolledMasterRuntime({ agent: { id: "agent-other" } }, env),
    ).toBe(false);
    expect(isEnrolledMasterRuntime({}, env)).toBe(false);
  });

  test("uses runtime context and ignores spoofed tool arguments", () => {
    expect(
      runtimeAgentId({
        agent: { id: "agent-runtime" },
        args: { agentId: "agent-spoofed" },
      }),
    ).toBe("agent-runtime");
    expect(() => runtimeAgentId({ args: { agentId: "agent-spoofed" } })).toThrow(
      "runtime agent",
    );
  });
});
