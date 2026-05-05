/**
 * Shell-spawn runner — direct port of cowork-gui's
 * src/tools/impl/shellRunner.ts. Handles process-group cleanup,
 * timeouts, abort propagation, and ENOENT surfacing in a way the
 * try-each launcher loop can branch on.
 */

import { spawn } from "node:child_process";

export class ShellExecutionError extends Error {
    code?: string;
    executable?: string;
}

export type ShellSpawnOptions = {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    signal?: AbortSignal;
    onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
};

const ABORT_KILL_TIMEOUT_MS = 2000;

export function spawnWithLauncher(
    launcher: string[],
    options: ShellSpawnOptions
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
        const [executable, ...args] = launcher;
        if (!executable) {
            reject(new ShellExecutionError("Executable is required"));
            return;
        }

        const childProcess = spawn(executable, args, {
            cwd: options.cwd,
            env: options.env,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            // detached on Unix → new process group for clean kill;
            // on Windows it would spawn a new console, which we don't want.
            detached: process.platform !== "win32",
            windowsHide: true,
        });

        const killProcessGroup = (signal: "SIGTERM" | "SIGKILL"): void => {
            if (childProcess.pid) {
                try {
                    if (process.platform !== "win32") {
                        process.kill(-childProcess.pid, signal);
                    } else {
                        childProcess.kill(signal);
                    }
                } catch {
                    try {
                        childProcess.kill(signal);
                    } catch {
                        /* already dead */
                    }
                }
            }
        };

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let timedOut = false;
        let killTimer: ReturnType<typeof setTimeout> | null = null;

        const timeoutId = options.timeoutMs
            ? setTimeout(() => {
                  timedOut = true;
                  killProcessGroup("SIGTERM");
              }, options.timeoutMs)
            : null;

        const abortHandler = (): void => {
            killProcessGroup("SIGTERM");
            if (!killTimer) {
                killTimer = setTimeout(() => {
                    if (
                        childProcess.exitCode === null &&
                        !childProcess.killed
                    ) {
                        killProcessGroup("SIGKILL");
                    }
                }, ABORT_KILL_TIMEOUT_MS);
            }
        };
        if (options.signal) {
            options.signal.addEventListener("abort", abortHandler, {
                once: true,
            });
        }

        childProcess.stdout?.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
            options.onOutput?.(chunk.toString("utf8"), "stdout");
        });

        childProcess.stderr?.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
            options.onOutput?.(chunk.toString("utf8"), "stderr");
        });

        childProcess.on("error", (err: NodeJS.ErrnoException) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
            if (options.signal) {
                options.signal.removeEventListener("abort", abortHandler);
            }
            const execError = new ShellExecutionError(
                err?.code === "ENOENT"
                    ? `Executable not found: ${executable}`
                    : `Failed to execute command: ${err?.message || "unknown error"}`
            );
            execError.code = err?.code;
            execError.executable = executable;
            reject(execError);
        });

        childProcess.on("close", (code) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
            if (options.signal) {
                options.signal.removeEventListener("abort", abortHandler);
            }

            const stdout = Buffer.concat(stdoutChunks).toString("utf8");
            const stderr = Buffer.concat(stderrChunks).toString("utf8");

            if (timedOut) {
                reject(
                    Object.assign(new Error("Command timed out"), {
                        killed: true,
                        signal: "SIGTERM",
                        stdout,
                        stderr,
                        code,
                    })
                );
                return;
            }

            if (options.signal?.aborted) {
                reject(
                    Object.assign(new Error("The operation was aborted"), {
                        name: "AbortError",
                        code: "ABORT_ERR",
                        stdout,
                        stderr,
                    })
                );
                return;
            }

            resolve({ stdout, stderr, exitCode: code });
        });
    });
}
