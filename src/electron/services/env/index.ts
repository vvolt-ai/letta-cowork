import { execFileSync } from "child_process";
import { config as dotenvConfig } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export type LettaEnvConfig = {
  LETTA_API_KEY: string;
  LETTA_BASE_URL: string;
  LETTA_AGENT_ID: string;
  IS_ADMIN: string
};

const USER_ENV_PATH = join(homedir(), ".letta-cowork.env");

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

function getUnixShellProfilePaths(): string[] {
  const home = homedir();
  const paths = [join(home, ".profile")];
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) paths.push(join(home, ".zshrc"));
  if (shell.includes("bash")) paths.push(join(home, ".bashrc"));
  return [...new Set(paths)];
}

function writeLettaEnvToUnixProfiles(values: LettaEnvConfig): void {
  const profilePaths = getUnixShellProfilePaths();
  for (const profilePath of profilePaths) {
    const profileContent = existsSync(profilePath) ? readFileSync(profilePath, "utf8") : "";
    const updated = (Object.keys(values) as (keyof LettaEnvConfig)[]).reduce(
      (content, key) => upsertEnvValue(content, key, values[key]),
      profileContent
    );
    writeFileSync(profilePath, updated, "utf8");
  }
}

function writeWindowsUserEnv(values: LettaEnvConfig): void {
  for (const [key, value] of Object.entries(values)) {
    execFileSync("reg", [
      "add",
      "HKCU\\Environment",
      "/v",
      key,
      "/t",
      "REG_SZ",
      "/d",
      value,
      "/f",
    ], { stdio: "ignore" });
  }

  // Notify the OS so new processes can pick up updated environment values.
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    "$signature='[DllImport(\"user32.dll\", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, int Msg, IntPtr wParam, string lParam, int fuFlags, int uTimeout, out IntPtr lpdwResult);'; Add-Type -MemberDefinition $signature -Name NativeMethods -Namespace Win32; $HWND_BROADCAST=[IntPtr]0xffff; $WM_SETTINGCHANGE=0x001A; $SMTO_ABORTIFHUNG=0x0002; $result=[IntPtr]::Zero; [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [IntPtr]::Zero, 'Environment', $SMTO_ABORTIFHUNG, 5000, [ref]$result) | Out-Null",
  ], { stdio: "ignore" });
}

function updateSystemEnvironment(values: LettaEnvConfig): void {
  if (process.platform === "win32") {
    writeWindowsUserEnv(values);
    return;
  }
  writeLettaEnvToUnixProfiles(values);
}

export function initializeLettaEnv(): void {
  dotenvConfig({ path: USER_ENV_PATH });
  dotenvConfig({ path: join(process.cwd(), ".env") });

  if (!process.env.LETTA_BASE_URL || process.env.IS_ADMIN != 'true') {
    process.env.LETTA_BASE_URL = "https://api.letta.com";
  }


  if (!process.env.LETTA_API_KEY || process.env.IS_ADMIN != 'true') {
    process.env.LETTA_API_KEY = "sk-let-NDI0MzRjNzEtZDAwNS00MzQzLTg4NzYtNTY0MzI5OTc2MDg0OjI3Y2IzNzZlLWExMDItNDM2NC05NjQ3LWM1YjdlYzI4NTMwNQ==";
  }

  if (!process.env.LETTA_API_KEY && process.env.LETTA_BASE_URL?.includes("localhost")) {
    process.env.LETTA_API_KEY = "local-dev-key";
  }

  if(!process.env.IS_ADMIN) {
    updateLettaEnvConfig({
      LETTA_API_KEY: process.env.LETTA_API_KEY,
      LETTA_BASE_URL: process.env.LETTA_BASE_URL,
      LETTA_AGENT_ID: 'agent-32b3f878-bdbb-41ea-8e7b-d920228ab1ec'
    } as LettaEnvConfig)
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
    IS_ADMIN: 'true'
  };

  validateLettaEnvConfig(normalized);

  process.env.LETTA_API_KEY = normalized.LETTA_API_KEY;
  process.env.LETTA_BASE_URL = normalized.LETTA_BASE_URL;
  process.env.LETTA_AGENT_ID = normalized.LETTA_AGENT_ID;
  process.env.IS_ADMIN='true'
  writeLettaEnvToUserFile(normalized);
  updateSystemEnvironment(normalized);
}
