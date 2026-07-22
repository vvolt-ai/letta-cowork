/**
 * Bash runner — port of cowork-gui's src/tools/impl/Bash.ts. Schema mirrors
 * letta-code's tools/schemas/Bash.json so the agent emits the exact
 * arguments shape it was trained on.
 *
 * Cross-platform behaviour comes from buildShellLaunchers() →
 * spawnWithLauncher() with try-each-ENOENT fallback and a cached
 * working launcher. On Windows, PowerShell is preferred (better PATH
 * compatibility) with a `$env:` alias prelude so agent-generated
 * `$AGENT_ID` / `$MEMORY_DIR` / etc. resolve identically to bash.
 */

import type {
    ClientToolDefinition,
    ToolRunContext,
    ToolRunResult,
} from "../types.js";
import {
    consumeWorkingDirectoryRecovery,
    getCurrentWorkingDirectory,
} from "./_shared/runtime-context.js";
import { getShellEnv } from "./shell/shellEnv.js";
import { buildShellLaunchers } from "./shell/shellLaunchers.js";
import { type ShellExecutionError, spawnWithLauncher } from "./shell/shellRunner.js";

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_CHARS = 64 * 1024;

// Cache the first launcher that successfully spawned. Reset on ENOENT.
let cachedWorkingLauncher: string[] | null = null;

function rebuildCachedLauncher(command: string): string[] | null {
    if (!cachedWorkingLauncher) return null;
    const cachedExe = cachedWorkingLauncher[0]?.toLowerCase();
    if (!cachedExe) return null;
    const launchers = buildShellLaunchers(command);
    return (
        launchers.find((l) => l[0]?.toLowerCase() === cachedExe) ?? null
    );
}

/**
 * Try each launcher in turn. ENOENT → next launcher. Any other error
 * propagates immediately. Mirrors cowork-gui's spawnCommand.
 */
async function spawnCommand(
    command: string,
    options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        timeoutMs: number;
        signal?: AbortSignal;
    }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    // On Unix we can use the simple direct invocation — original cowork-gui
    // logic notes ARM64 CI fallback issues, so they keep this fast path.
    if (process.platform !== "win32") {
        const executable =
            process.platform === "darwin" ? "/bin/zsh" : "bash";
        return spawnWithLauncher([executable, "-c", command], {
            cwd: options.cwd,
            env: options.env,
            timeoutMs: options.timeoutMs,
            signal: options.signal,
        });
    }

    // Windows: use full fallback chain.
    if (cachedWorkingLauncher) {
        const reused = rebuildCachedLauncher(command);
        if (reused) {
            try {
                return await spawnWithLauncher(reused, {
                    cwd: options.cwd,
                    env: options.env,
                    timeoutMs: options.timeoutMs,
                    signal: options.signal,
                });
            } catch (err) {
                const e = err as ShellExecutionError;
                if (e.code !== "ENOENT" || e.reason === "cwd_missing") throw err;
                cachedWorkingLauncher = null;
            }
        }
    }

    const launchers = buildShellLaunchers(command);
    if (launchers.length === 0) {
        throw new Error("No shell launchers available");
    }
    const tried: string[] = [];
    let lastError: Error | null = null;
    for (const launcher of launchers) {
        try {
            const result = await spawnWithLauncher(launcher, {
                cwd: options.cwd,
                env: options.env,
                timeoutMs: options.timeoutMs,
                signal: options.signal,
            });
            cachedWorkingLauncher = launcher;
            return result;
        } catch (err) {
            const e = err as ShellExecutionError;
            if (e.code === "ENOENT" && e.reason !== "cwd_missing") {
                tried.push(launcher[0] || "unknown");
                lastError = e;
                continue;
            }
            throw err;
        }
    }
    const suffix = tried.filter(Boolean).join(", ");
    const reason = lastError?.message || "Shell unavailable";
    throw new Error(suffix ? `${reason} (tried: ${suffix})` : reason);
}

// ─────────────────────── Tool definition ────────────────────────────
export const bashTool: ClientToolDefinition = {
    name: "Bash",
    description:
        "Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures. " +
        "IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. Do not use for file edits or reads — use Edit/Read instead. " +
        "Avoid commands that require interactive input (no TTY). Combined stdout+stderr is returned.",
    parameters: {
        type: "object",
        properties: {
            command: { type: "string", description: "The command to execute" },
            timeout: {
                type: "number",
                description: "Optional timeout in milliseconds (max 600000)",
            },
            description: {
                type: "string",
                description:
                    "Clear, concise description of what this command does in active voice (5-10 words for simple commands).",
            },
            run_in_background: {
                type: "boolean",
                description:
                    "Set to true to run this command in the background. Use TaskOutput to read the output later.",
            },
        },
        required: ["command", "description"],
        additionalProperties: false,
    },
    run: async (args, ctx) => runBash(args, ctx),
};

async function runBash(
    args: Record<string, unknown>,
    ctx: ToolRunContext
): Promise<ToolRunResult> {
    const command = String(args.command ?? "").trim();
    if (!command) {
        return { output: "Bash: missing 'command' argument", isError: true };
    }
    const cwd = getCurrentWorkingDirectory();
    const recoveredFrom = consumeWorkingDirectoryRecovery();
    const recoveryNote = recoveredFrom
        ? `Note: working directory ${recoveredFrom} no longer exists; running in ${cwd} instead.\n`
        : "";
    const requested =
        typeof args.timeout === "number" && args.timeout > 0
            ? args.timeout
            : typeof args.timeout_ms === "number" && args.timeout_ms > 0
              ? args.timeout_ms
              : DEFAULT_TIMEOUT_MS;
    const timeoutMs = Math.min(Math.max(requested, 1), MAX_TIMEOUT_MS);

    try {
        const { stdout, stderr, exitCode } = await spawnCommand(command, {
            cwd,
            env: getShellEnv(),
            timeoutMs,
            signal: ctx.signal,
        });

        let output = stdout || "";
        if (stderr) output = output ? `${output}\n${stderr}` : stderr;
        if (output.length > MAX_OUTPUT_CHARS) {
            output =
                output.slice(0, MAX_OUTPUT_CHARS) +
                `\n[output truncated to ${MAX_OUTPUT_CHARS} chars]`;
        }
        if (!output) output = "(Command completed with no output)";

        if (exitCode !== 0 && exitCode !== null) {
            return {
                output: `${recoveryNote}Exit code: ${exitCode}\n${output}`,
                isError: true,
            };
        }
        return { output: `${recoveryNote}${output}`, isError: false };
    } catch (err) {
        const e = err as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            killed?: boolean;
            signal?: string;
        };
        if (
            ctx.signal.aborted ||
            e.code === "ABORT_ERR" ||
            e.name === "AbortError"
        ) {
            return { output: "[cancelled]", isError: true };
        }
        let msg = "";
        if (e.killed && e.signal === "SIGTERM") {
            msg += `Command timed out after ${timeoutMs}ms\n`;
        }
        if (e.stderr) msg += e.stderr;
        else if (e.message) msg += e.message;
        if (e.stdout) msg = `${e.stdout}\n${msg}`;
        if (msg.length > MAX_OUTPUT_CHARS) {
            msg =
                msg.slice(0, MAX_OUTPUT_CHARS) +
                `\n[output truncated to ${MAX_OUTPUT_CHARS} chars]`;
        }
        return {
            output: `${recoveryNote}${msg.trim() || "Command failed with unknown error"}`,
            isError: true,
        };
    }
}
