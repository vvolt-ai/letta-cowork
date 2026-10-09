import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR_ENV = 'LETTA_CODE_TOOLS_DIR';

function binaryName(): string {
  return platform() === 'win32' ? 'rg.exe' : 'rg';
}

function commandWorks(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const result = spawnSync(command, ['--version'], {
      env,
      stdio: 'pipe',
      timeout: 3000,
      windowsHide: true,
    });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

function getManagedToolsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env[TOOLS_DIR_ENV] || join(homedir(), '.letta', 'bin');
}

function getBundledRipgrepPath(): string | null {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const require = createRequire(__filename);
    const rgPackage = require('@vscode/ripgrep') as { rgPath?: unknown };
    return typeof rgPackage.rgPath === 'string' ? rgPackage.rgPath : null;
  } catch {
    return null;
  }
}

export function unpackedExecutablePath(filePath: string): string {
  // Electron can read inside ASAR, but child_process cannot execute there.
  return filePath.replace(/\.asar([\\/])/i, '.asar.unpacked$1');
}

interface RipgrepResolverOptions {
  env?: NodeJS.ProcessEnv;
  exists?: (filePath: string) => boolean;
  works?: (command: string, env: NodeJS.ProcessEnv) => boolean;
  bundledPath?: string | null;
}

export function resolveRipgrep(options: RipgrepResolverOptions = {}): string | null {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const works = options.works ?? commandWorks;
  const managedPath = join(getManagedToolsDir(env), binaryName());
  if (exists(managedPath) && works(managedPath, env)) {
    return managedPath;
  }

  if (works('rg', env)) {
    return 'rg';
  }

  const rawBundledPath =
    options.bundledPath === undefined ? getBundledRipgrepPath() : options.bundledPath;
  const bundledPath = rawBundledPath && unpackedExecutablePath(rawBundledPath);
  if (bundledPath && exists(bundledPath) && works(bundledPath, env)) {
    return bundledPath;
  }

  return null;
}

export async function ensureRipgrep(): Promise<string | null> {
  return resolveRipgrep();
}
