import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const DEFAULT_VERA_SERVER_URL = "http://localhost:3010";
export const STATE_VERSION = 1;

export function stateFilePath(env = process.env) {
  return (
    env.VERA_LETTA_STATE_PATH ||
    join(env.LETTA_HOME || join(homedir(), ".letta"), "vera", "connection.json")
  );
}

export function normalizeServerUrl(value) {
  const input = String(value || "").trim();
  if (!input) return DEFAULT_VERA_SERVER_URL;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid Vera server URL: ${input}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Vera server URL must use http:// or https://");
  }
  if (url.username || url.password) {
    throw new Error("Vera server URL must not contain embedded credentials");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function emptyState(env = process.env) {
  return {
    version: STATE_VERSION,
    serverUrl: normalizeServerUrl(env.VERA_SERVER_URL || DEFAULT_VERA_SERVER_URL),
    pendingEmail: null,
    auth: null,
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeState(value, env = process.env) {
  const fallback = emptyState(env);
  if (!isRecord(value)) return fallback;

  const auth = isRecord(value.auth)
    ? {
        accessToken:
          typeof value.auth.accessToken === "string" ? value.auth.accessToken : "",
        refreshToken:
          typeof value.auth.refreshToken === "string" ? value.auth.refreshToken : "",
        refreshTokenExpiresAt:
          typeof value.auth.refreshTokenExpiresAt === "string"
            ? value.auth.refreshTokenExpiresAt
            : null,
        user: isRecord(value.auth.user) ? value.auth.user : null,
        currentOrganization: isRecord(value.auth.currentOrganization)
          ? value.auth.currentOrganization
          : null,
      }
    : null;

  return {
    version: STATE_VERSION,
    serverUrl: normalizeServerUrl(
      typeof value.serverUrl === "string" ? value.serverUrl : fallback.serverUrl,
    ),
    pendingEmail:
      typeof value.pendingEmail === "string" && value.pendingEmail.trim()
        ? value.pendingEmail.trim().toLowerCase()
        : null,
    auth: auth?.accessToken || auth?.refreshToken ? auth : null,
  };
}

export async function readState(env = process.env) {
  const file = stateFilePath(env);
  try {
    return normalizeState(JSON.parse(await readFile(file, "utf8")), env);
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState(env);
    if (error instanceof SyntaxError) {
      throw new Error(`Vera connection state is invalid JSON: ${file}`);
    }
    throw error;
  }
}

export async function writeState(state, env = process.env) {
  const file = stateFilePath(env);
  const directory = dirname(file);
  const normalized = normalizeState(state, env);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);

  try {
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporary, 0o600).catch(() => undefined);
    await rename(temporary, file);
    await chmod(file, 0o600).catch(() => undefined);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }

  return normalized;
}

export async function clearAuth(env = process.env) {
  const state = await readState(env);
  state.pendingEmail = null;
  state.auth = null;
  return writeState(state, env);
}
