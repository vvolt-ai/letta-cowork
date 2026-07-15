import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearAuth,
  emptyState,
  normalizeServerUrl,
  readState,
  stateFilePath,
  writeState,
} from "./state.js";

const cleanup = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function testEnv() {
  const root = await mkdtemp(join(tmpdir(), "letta-vera-state-"));
  cleanup.push(root);
  return { VERA_LETTA_STATE_PATH: join(root, "nested", "connection.json") };
}

describe("Vera state", () => {
  test("normalizes server URLs", () => {
    expect(normalizeServerUrl("https://vera.example.com///?ignored=true#x")).toBe(
      "https://vera.example.com",
    );
    expect(() => normalizeServerUrl("file:///tmp/vera")).toThrow(
      "must use http:// or https://",
    );
    expect(() => normalizeServerUrl("https://user:secret@vera.example.com")).toThrow(
      "must not contain embedded credentials",
    );
  });

  test("creates and reads private connection state", async () => {
    const env = await testEnv();
    const state = emptyState(env);
    state.serverUrl = "https://vera.example.com";
    state.pendingEmail = "User@Verivolt.com";
    state.auth = {
      accessToken: "access",
      refreshToken: "refresh",
      refreshTokenExpiresAt: null,
      user: { email: "user@verivolt.com" },
      currentOrganization: { name: "Verivolt" },
    };

    await writeState(state, env);
    const loaded = await readState(env);

    expect(loaded.pendingEmail).toBe("user@verivolt.com");
    expect(loaded.auth.refreshToken).toBe("refresh");
    expect(JSON.parse(await readFile(stateFilePath(env), "utf8"))).toEqual(loaded);
    if (process.platform !== "win32") {
      expect((await stat(stateFilePath(env))).mode & 0o777).toBe(0o600);
    }
  });

  test("clearAuth preserves the configured server", async () => {
    const env = await testEnv();
    await writeState(
      {
        version: 1,
        serverUrl: "https://vera.example.com",
        pendingEmail: "user@verivolt.com",
        auth: { accessToken: "a", refreshToken: "r" },
      },
      env,
    );

    const state = await clearAuth(env);
    expect(state.serverUrl).toBe("https://vera.example.com");
    expect(state.pendingEmail).toBeNull();
    expect(state.auth).toBeNull();
  });
});
