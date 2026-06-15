/**
 * Slim port of cowork-gui's src/tools/impl/shellEnv.ts.
 *
 * Builds the env handed to spawn():
 *   • Adds bundled @vscode/ripgrep dir to PATH if available (so Grep
 *     "just works" on Windows without ripgrep being installed system-wide).
 *   • Neuters interactive pagers — without these, `git log`, `man`, etc.
 *     spawn an interactive pager that hangs the spawn forever (no TTY).
 *   • Sets TERM if missing.
 *
 * Letta-code-specific bits (memoryFilesystem, settingsManager, agent
 * context, NODE_PATH for skill scripts) are intentionally omitted —
 * letta-cowork doesn't have those subsystems on the same layer.
 */

import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

function getRipgrepBinDir(): string | undefined {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const require = createRequire(__filename);
        const rgPackage = require("@vscode/ripgrep") as { rgPath: string };
        return path.dirname(rgPackage.rgPath);
    } catch {
        return undefined;
    }
}

export function getShellEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };

    // Locate the PATH variable case-insensitively (Windows uses "Path").
    const pathKey =
        Object.keys(env).find((k) => k.toUpperCase() === "PATH") || "PATH";

    const pathPrefixes: string[] = [];
    const rgBinDir = getRipgrepBinDir();
    if (rgBinDir) pathPrefixes.push(rgBinDir);

    if (pathPrefixes.length > 0) {
        const existing = env[pathKey] || "";
        env[pathKey] = existing
            ? `${pathPrefixes.join(path.delimiter)}${path.delimiter}${existing}`
            : pathPrefixes.join(path.delimiter);
    }

    // Neuter interactive pagers — prevents `git log`, `man`, etc. from
    // hanging when spawned without a TTY.
    env.PAGER = "cat";
    env.GIT_PAGER = "cat";
    env.MANPAGER = "cat";
    if (!env.TERM) env.TERM = "xterm-256color";

    // Force UTF-8 for Python and locale-sensitive CLIs on Windows. Without
    // this, Python tools that print symbols/non-ASCII text can fail with
    // `UnicodeEncodeError: 'charmap' codec can't encode ...`, which then
    // breaks JSON-producing tool workflows.
    env.PYTHONIOENCODING = env.PYTHONIOENCODING || "utf-8";
    env.PYTHONUTF8 = env.PYTHONUTF8 || "1";
    if (process.platform === "win32") {
        env.LC_ALL = env.LC_ALL || "C.UTF-8";
        env.LANG = env.LANG || "C.UTF-8";
    }

    return env;
}
