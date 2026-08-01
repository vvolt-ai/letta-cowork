import fs from "node:fs";
import path from "node:path";
import { runClientTool, isClientTool } from "../client-tools/index.js";
import type { RemoteAccessSettings } from "./types.js";

const FILE_PATH_ARG_KEYS = ["file_path", "path", "directory", "cwd", "pattern"];
const BLOCKED_BASH_PATTERNS = [
  /rm\s+-rf\s+\//i,
  /sudo\s+rm\b/i,
  /\bmkfs\b/i,
  /diskutil\s+erase/i,
  /git\s+push\s+--force/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/,
];
const SECRET_OUTPUT_PATTERNS: Array<[RegExp, string]> = [
  [/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)[A-Z0-9_]*\s*[=:]\s*)[^\s\n]+/gi, "$1[REDACTED]"],
  [/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]"],
];

export class RemoteToolDispatcher {
  constructor(private readonly settings: RemoteAccessSettings) {}

  async runTool(input: {
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    cwd?: string;
    timeoutMs?: number;
    agentId?: string;
    conversationId?: string;
  }): Promise<{ status: "success" | "error" | "cancelled"; output: string; metadata?: Record<string, unknown> }> {
    if (!this.settings.enabled) {
      return { status: "error", output: "Remote access is disabled on this machine." };
    }
    if (!this.settings.autoApprove) {
      return { status: "error", output: "Remote access manual approval is not implemented in Phase 1." };
    }
    if (!isClientTool(input.toolName)) {
      return { status: "error", output: `Client tool '${input.toolName}' is not registered on this device.` };
    }

    const validationError = this.validateRequest(input.toolName, input.args, input.cwd);
    if (validationError) return { status: "error", output: validationError };

    const controller = new AbortController();
    const timeout = input.timeoutMs
      ? setTimeout(() => controller.abort(new Error("Remote tool timed out")), input.timeoutMs)
      : undefined;
    try {
      const result = await runClientTool(input.toolName, input.args, {
        signal: controller.signal,
        agentId: input.agentId,
        conversationId: input.conversationId,
        toolCallId: input.requestId,
      });
      return {
        status: result.isError ? "error" : "success",
        output: redactOutput(result.output),
      };
    } catch (err) {
      if (controller.signal.aborted) {
        return { status: "cancelled", output: "Remote tool execution was cancelled or timed out." };
      }
      return { status: "error", output: err instanceof Error ? err.stack ?? err.message : String(err) };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private validateRequest(toolName: string, args: Record<string, unknown>, cwd?: string): string | null {
    if (toolName === "Bash") {
      const command = typeof args.command === "string" ? args.command : "";
      if (!command.trim()) return "Bash requires a command.";
      for (const pattern of BLOCKED_BASH_PATTERNS) {
        if (pattern.test(command)) return "Blocked potentially destructive shell command for remote access Phase 1.";
      }
    }

    const cwdCandidate = cwd ?? (typeof args.cwd === "string" ? args.cwd : undefined);
    if (cwdCandidate && !this.isInsideAllowedDirectory(cwdCandidate)) {
      return `cwd is outside the configured remote allowed directories: ${cwdCandidate}`;
    }

    for (const key of FILE_PATH_ARG_KEYS) {
      const value = args[key];
      if (typeof value !== "string" || !value.trim()) continue;
      if (key === "pattern" && /[*?{[!]/.test(value)) {
        const base = typeof args.path === "string" ? args.path : cwdCandidate;
        if (base && !this.isInsideAllowedDirectory(base)) return `${key} base path is outside allowed directories.`;
        continue;
      }
      if (!this.isInsideAllowedDirectory(value)) {
        return `${key} is outside the configured remote allowed directories: ${value}`;
      }
      if (isBlockedCredentialPath(value)) {
        return `${key} targets a blocked credential/session file.`;
      }
    }

    return null;
  }

  private isInsideAllowedDirectory(candidate: string): boolean {
    const allowed = this.settings.allowedDirectories.map((dir) => path.resolve(expandHome(dir)));
    if (allowed.length === 0) return false;
    const resolved = path.resolve(expandHome(candidate));
    return allowed.some((dir) => {
      // Allow configuring an entire filesystem root, e.g. "/" on macOS/Linux
      // or "C:\\" on Windows. The generic prefix check below cannot handle
      // root because `${dir}${path.sep}` becomes "//" on POSIX.
      if (dir === path.parse(dir).root) return resolved.startsWith(dir);
      return resolved === dir || resolved.startsWith(`${dir}${path.sep}`);
    });
  }
}

function expandHome(candidate: string): string {
  if (candidate === "~") return process.env.HOME ?? candidate;
  if (candidate.startsWith(`~${path.sep}`)) return path.join(process.env.HOME ?? "", candidate.slice(2));
  return candidate;
}

function isBlockedCredentialPath(candidate: string): boolean {
  const base = path.basename(candidate).toLowerCase();
  if (base === ".env" || base.endsWith(".pem") || base.endsWith(".key")) return true;
  const resolved = path.resolve(expandHome(candidate));
  return fs.existsSync(resolved) && /\/(auth|credentials|sessions?)\//i.test(resolved);
}

function redactOutput(output: string): string {
  return SECRET_OUTPUT_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), output);
}
