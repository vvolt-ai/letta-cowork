import os from "node:os";
import path from "node:path";
import {
  getRemoteAccessSettings as getStoredRemoteAccessSettings,
  updateRemoteAccessSettings as updateStoredRemoteAccessSettings,
  type RemoteAccessSettings,
} from "../settings/index.js";

export const DEFAULT_REMOTE_TOOL_CAPABILITIES = [
  "ProjectContext",
  "Git",
  "Read",
  "LS",
  "Grep",
  "Glob",
  "Bash",
  "LogTail",
];

export function getRemoteAccessSettings(): RemoteAccessSettings {
  return getStoredRemoteAccessSettings();
}

export function updateRemoteAccessSettings(updates: Partial<RemoteAccessSettings>): RemoteAccessSettings {
  return updateStoredRemoteAccessSettings(updates);
}

export function getDefaultEnvironmentName(): string {
  return `${os.hostname() || "cowork-desktop"}`.trim();
}

export function normalizeAllowedDirectories(dirs: string[]): string[] {
  const seen = new Set<string>();
  for (const dir of dirs) {
    if (typeof dir !== "string") continue;
    const trimmed = dir.trim();
    if (!trimmed) continue;
    seen.add(path.resolve(trimmed));
  }
  return Array.from(seen);
}
