import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { config as dotenvConfig } from "dotenv";

export type LettaEnvConfig = {
  LETTA_API_KEY: string;
  LETTA_BASE_URL: string;
  LETTA_AGENT_ID: string;
  IS_ADMIN: string
};

const USER_ENV_PATH = join(homedir(), ".letta-cowork.env");
const DEFAULT_EMAIL_SERVER_BASE_URL = "https://zoho.ngrok.app";

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function upsertEnvValue(source: string, key: keyof LettaEnvConfig, value: string): string {
  const line = `${key}=${quoteEnvValue(value)}`;
  const matcher = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (matcher.test(source)) {
    return source.replace(matcher, line);
  }
  const suffix = source.length === 0 || source.endsWith("\n") ? "" : "\n";
  return `${source}${suffix}${line}\n`;
}

function writeLettaEnvToUserFile(values: LettaEnvConfig): void {
  const fileContent = existsSync(USER_ENV_PATH) ? readFileSync(USER_ENV_PATH, "utf8") : "";
  const updated = (Object.keys(values) as (keyof LettaEnvConfig)[]).reduce(
    (content, key) => upsertEnvValue(content, key, values[key]),
    fileContent
  );
  writeFileSync(USER_ENV_PATH, updated, "utf8");
}

export function initializeLettaEnv(): void {
  dotenvConfig({ path: USER_ENV_PATH });
  dotenvConfig({ path: join(process.cwd(), ".env") });

  if (!process.env.EMAIL_SERVER_BASE_URL?.trim()) {
    process.env.EMAIL_SERVER_BASE_URL = DEFAULT_EMAIL_SERVER_BASE_URL;
  }

  if (!process.env.LETTA_BASE_URL) {
    process.env.LETTA_BASE_URL = "https://api.letta.com";
  }

  // Local/self-hosted Letta remains available as an offline fallback. Vera
  // account credentials are resolved by the server and are never written here.
  if (!process.env.LETTA_API_KEY && process.env.LETTA_BASE_URL.includes("localhost")) {
    process.env.LETTA_API_KEY = "local-dev-key";
  }
}

export function getLettaEnvConfig(): LettaEnvConfig {
  return {
    LETTA_API_KEY: process.env.LETTA_API_KEY ?? "",
    LETTA_BASE_URL: process.env.LETTA_BASE_URL ?? "",
    LETTA_AGENT_ID: process.env.LETTA_AGENT_ID ?? "",
    IS_ADMIN: process.env.IS_ADMIN ?? "",
  };
}

function validateLettaEnvConfig(values: LettaEnvConfig): void {
  const missing: (keyof LettaEnvConfig)[] = [];
  if (!values.LETTA_API_KEY.trim()) missing.push("LETTA_API_KEY");
  if (!values.LETTA_BASE_URL.trim()) missing.push("LETTA_BASE_URL");
  if (!values.LETTA_AGENT_ID.trim()) missing.push("LETTA_AGENT_ID");

  if (missing.length > 0) {
    throw new Error(`Missing required env value(s): ${missing.join(", ")}`);
  }
}

export function updateLettaEnvConfig(values: LettaEnvConfig): void {
  const normalized: LettaEnvConfig = {
    LETTA_API_KEY: values.LETTA_API_KEY.trim(),
    LETTA_BASE_URL: values.LETTA_BASE_URL.trim(),
    LETTA_AGENT_ID: values.LETTA_AGENT_ID.trim(),
    IS_ADMIN: values.IS_ADMIN?.trim() || process.env.IS_ADMIN || "",
  };

  validateLettaEnvConfig(normalized);

  process.env.LETTA_API_KEY = normalized.LETTA_API_KEY;
  process.env.LETTA_BASE_URL = normalized.LETTA_BASE_URL;
  process.env.LETTA_AGENT_ID = normalized.LETTA_AGENT_ID;
  process.env.IS_ADMIN = normalized.IS_ADMIN;
  writeLettaEnvToUserFile(normalized);
}
