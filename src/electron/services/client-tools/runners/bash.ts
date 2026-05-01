/**
 * Bash runner — executes a shell command via /bin/bash -lc and
 * returns combined stdout + stderr (stderr labelled).
 *
 * Constraints:
 *   • 2-minute hard timeout (configurable per call via `timeout_ms`)
 *   • output truncated to 64 KB
 *   • respects ctx.signal — kills the process on abort
 */

import { spawn } from "child_process";
import type {
    ClientToolDefinition,
    ToolRunContext,
    ToolRunResult,
} from "../types.js";

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 64 * 1024;

// Schema mirrors letta-code's tools/schemas/Bash.json exactly so the agent
// emits the same arguments shape it was trained for.
export const bashTool: ClientToolDefinition = {
    name: "Bash",
    description:
        "Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures. " +
        "IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. Do not use for file edits or reads — use Edit/Read instead. " +
        "Avoid commands that require interactive input (no TTY). Combined stdout+stderr is returned.",
    parameters: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The command to execute",
            },
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
        required: ["command"],
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
    const cwd = process.env.USER_CWD || process.env.HOME || process.cwd();
    // letta-code uses `timeout` (ms). We accept either `timeout` or legacy `timeout_ms`.
    const rawTimeout =
        typeof args.timeout === "number" && args.timeout > 0
            ? args.timeout
            : typeof args.timeout_ms === "number" && args.timeout_ms > 0
              ? args.timeout_ms
              : DEFAULT_TIMEOUT_MS;
    const requested = rawTimeout;
    const timeoutMs = Math.min(requested, MAX_TIMEOUT_MS);

    return new Promise<ToolRunResult>((resolve) => {
        const child = spawn("/bin/bash", ["-lc", command], {
            cwd,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdoutBuf = "";
        let stderrBuf = "";
        let totalBytes = 0;
        let truncated = false;
        let settled = false;

        const append = (target: "stdout" | "stderr", chunk: Buffer): void => {
            if (truncated) return;
            const remaining = MAX_OUTPUT_BYTES - totalBytes;
            if (remaining <= 0) {
                truncated = true;
                return;
            }
            const slice = chunk.slice(0, remaining);
            totalBytes += slice.length;
            if (target === "stdout") stdoutBuf += slice.toString("utf-8");
            else stderrBuf += slice.toString("utf-8");
            if (chunk.length > slice.length) truncated = true;
        };

        const finish = (
            kind: "exit" | "timeout" | "abort" | "error",
            extra: { code?: number | null; reason?: string } = {}
        ): void => {
            if (settled) return;
            settled = true;
            try {
                if (!child.killed) child.kill("SIGTERM");
            } catch {
                /* ignore */
            }
            const parts: string[] = [];
            if (stdoutBuf) parts.push(stdoutBuf.trimEnd());
            if (stderrBuf) parts.push(`[stderr]\n${stderrBuf.trimEnd()}`);
            if (truncated) parts.push("[output truncated to 64 KB]");
            if (kind === "timeout") parts.push(`[timed out after ${timeoutMs} ms]`);
            if (kind === "abort") parts.push("[cancelled]");
            if (kind === "error" && extra.reason)
                parts.push(`[spawn error: ${extra.reason}]`);
            const output = parts.join("\n").trim() || "(no output)";
            const isError =
                kind !== "exit" || (typeof extra.code === "number" && extra.code !== 0);
            resolve({ output, isError });
        };

        child.stdout?.on("data", (c: Buffer) => append("stdout", c));
        child.stderr?.on("data", (c: Buffer) => append("stderr", c));
        child.on("close", (code) => finish("exit", { code }));
        child.on("error", (err) =>
            finish("error", { reason: err.message ?? String(err) })
        );

        const timer = setTimeout(() => finish("timeout"), timeoutMs);

        const onAbort = () => finish("abort");
        ctx.signal.addEventListener("abort", onAbort, { once: true });

        // Make sure timer + listener get released after we settle.
        const cleanupAfter = (): void => {
            clearTimeout(timer);
            ctx.signal.removeEventListener("abort", onAbort);
        };
        const origResolve = resolve;
        resolve = ((value) => {
            cleanupAfter();
            origResolve(value);
        }) as typeof resolve;
    });
}
