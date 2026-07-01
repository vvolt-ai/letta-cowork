import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS_DIR_ENV = "LETTA_CODE_TOOLS_DIR";

function binaryName(): string {
  return platform() === "win32" ? "rg.exe" : "rg";
}

function commandWorks(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const result = spawnSync(command, ["--version"], { env, stdio: "pipe" });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function getManagedToolsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env[TOOLS_DIR_ENV] || join(homedir(), ".letta", "bin");
}

function getBundledRipgrepPath(): string | null {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const require = createRequire(__filename);
    const rgPackage = require("@vscode/ripgrep") as { rgPath?: unknown };
    return typeof rgPackage.rgPath === "string" ? rgPackage.rgPath : null;
  } catch {
    return null;
  }
}

export async function ensureRipgrep(): Promise<string | null> {
  const managedPath = join(getManagedToolsDir(), binaryName());
  if (existsSync(managedPath) && commandWorks(managedPath)) {
    return managedPath;
  }

  if (commandWorks("rg")) {
    return "rg";
  }

  const bundledPath = getBundledRipgrepPath();
  if (bundledPath && existsSync(bundledPath) && commandWorks(bundledPath)) {
    return bundledPath;
  }

  return null;
}
