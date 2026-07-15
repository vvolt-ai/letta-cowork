import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const COWORK_TOKEN_KEY = "COWORK_TOKEN";
const COWORK_SERVER_URL_KEYS = ["VERA_COWORK_API_URL", "VERA_SERVER_URL"];

export function coworkEnvFilePath(env = process.env) {
  return (
    env.VERA_COWORK_ENV_PATH ||
    join(env.HOME || homedir(), ".letta-cowork", "cowork.env")
  );
}

function unwrapShellValue(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === "'" || quote === '"') && trimmed.at(-1) === quote) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Parse only the Cowork values this mod understands. This intentionally does
 * not execute or expand the shell file.
 */
export function parseCoworkEnv(contents) {
  const values = {};
  for (const line of String(contents ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key !== COWORK_TOKEN_KEY && !COWORK_SERVER_URL_KEYS.includes(key)) {
      continue;
    }
    const value = unwrapShellValue(rawValue);
    if (value && !value.includes("\0")) values[key] = value;
  }
  return values;
}

/**
 * Read Cowork-managed authentication on every request so a rotated access
 * token is picked up without restarting Letta Code. The file wins over the
 * process environment because a child process receives only an environment
 * snapshot when it starts.
 */
export async function readCoworkAuth(env = process.env) {
  const path = coworkEnvFilePath(env);
  try {
    const values = parseCoworkEnv(await readFile(path, "utf8"));
    if (values.COWORK_TOKEN) {
      return {
        accessToken: values.COWORK_TOKEN,
        serverUrl:
          values.VERA_COWORK_API_URL ||
          values.VERA_SERVER_URL ||
          String(env.VERA_COWORK_API_URL || env.VERA_SERVER_URL || "").trim() ||
          null,
        source: "cowork.env",
      };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const accessToken = String(env.COWORK_TOKEN || "").trim();
  if (!accessToken) return null;
  return {
    accessToken,
    serverUrl:
      String(env.VERA_COWORK_API_URL || env.VERA_SERVER_URL || "").trim() ||
      null,
    source: "COWORK_TOKEN",
  };
}
