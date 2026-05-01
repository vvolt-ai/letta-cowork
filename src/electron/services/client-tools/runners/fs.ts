/**
 * File-system client tools — Read, Write, Edit, LS, Glob, Grep, TodoWrite.
 *
 * Schemas mirror letta-code's tools/schemas/*.json one-for-one so the agent
 * emits arguments in the exact shape it was trained on. Implementations are
 * minimal but functional — they cover the happy path plus the most common
 * error cases letta-code surfaces (e.g. "File not found", "Path is not
 * absolute", "old_string not unique").
 *
 * `requiresApproval` is informational here — letta-code uses it client-side
 * to decide whether to prompt; on letta_v1_agent the server raises an
 * approval_request_message which our session.ts auto-allows when
 * permissionMode === "bypassPermissions".
 */

import { spawn } from "child_process";
import {
    existsSync,
    promises as fs,
    readdirSync,
    statSync,
} from "fs";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { glob as globAsync } from "glob";
import type { ClientToolDefinition, ToolRunResult } from "../types.js";

const MAX_BYTES = 256 * 1024;
const DEFAULT_READ_LINES = 2000;
const MAX_LINE_LEN = 2000;

function err(msg: string): ToolRunResult {
    return { output: msg, isError: true };
}
function ok(msg: string): ToolRunResult {
    return { output: msg, isError: false };
}
function requireAbs(p: unknown, field: string): string | ToolRunResult {
    if (typeof p !== "string" || !p.trim()) {
        return err(`${field} is required`);
    }
    if (!isAbsolute(p)) {
        return err(`${field} must be an absolute path, got '${p}'`);
    }
    return p;
}

// ─────────────────────────── Read ───────────────────────────
export const readTool: ClientToolDefinition = {
    name: "Read",
    description:
        "Reads a file from the local filesystem. Returns content with cat -n line numbers starting at 1. " +
        "file_path must be absolute. Lines longer than 2000 chars are truncated. Default 2000 lines from offset 0.",
    parameters: {
        type: "object",
        properties: {
            file_path: { type: "string", description: "The absolute path to the file to read" },
            offset: { type: "number", description: "Line number to start from (1-based)" },
            limit: { type: "number", description: "Number of lines to read" },
        },
        required: ["file_path"],
        additionalProperties: false,
    },
    run: async (args) => {
        const p = requireAbs(args.file_path, "file_path");
        if (typeof p !== "string") return p;
        try {
            const stat = await fs.stat(p);
            if (stat.isDirectory()) return err(`'${p}' is a directory, not a file. Use LS.`);
            if (stat.size > MAX_BYTES * 4) {
                // very large file — refuse without explicit offset/limit
                if (args.limit === undefined && args.offset === undefined) {
                    return err(
                        `File too large (${stat.size} bytes). Pass offset/limit to read in chunks.`
                    );
                }
            }
            const text = await fs.readFile(p, "utf-8");
            const lines = text.split(/\r?\n/);
            const offset =
                typeof args.offset === "number" && args.offset > 0
                    ? Math.floor(args.offset) - 1
                    : 0;
            const limit =
                typeof args.limit === "number" && args.limit > 0
                    ? Math.floor(args.limit)
                    : DEFAULT_READ_LINES;
            const slice = lines.slice(offset, offset + limit);
            const out = slice
                .map((line, i) => {
                    const ln = offset + i + 1;
                    const trimmed =
                        line.length > MAX_LINE_LEN
                            ? line.slice(0, MAX_LINE_LEN) + "…[truncated]"
                            : line;
                    return `${String(ln).padStart(6)}\t${trimmed}`;
                })
                .join("\n");
            if (out.trim().length === 0) {
                return ok("(file is empty or selected range is empty)");
            }
            return ok(out);
        } catch (e) {
            return err(`Read failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
};

// ─────────────────────────── Write ───────────────────────────
export const writeTool: ClientToolDefinition = {
    name: "Write",
    description:
        "Writes a file to the local filesystem. Overwrites if it exists. file_path must be absolute. " +
        "Prefer Edit over Write when modifying existing files.",
    parameters: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "The absolute path to the file to write (must be absolute, not relative)",
            },
            content: { type: "string", description: "The content to write to the file" },
        },
        required: ["file_path", "content"],
        additionalProperties: false,
    },
    run: async (args) => {
        const p = requireAbs(args.file_path, "file_path");
        if (typeof p !== "string") return p;
        const content = typeof args.content === "string" ? args.content : "";
        try {
            await fs.mkdir(dirname(p), { recursive: true });
            await fs.writeFile(p, content, "utf-8");
            return ok(`Wrote ${content.length} bytes to ${p}`);
        } catch (e) {
            return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
};

// ─────────────────────────── Edit ───────────────────────────
export const editTool: ClientToolDefinition = {
    name: "Edit",
    description:
        "Performs exact string replacements in files. old_string must be unique in the file unless replace_all is true. " +
        "file_path must be absolute. Preserve exact indentation when copying from Read output.",
    parameters: {
        type: "object",
        properties: {
            file_path: { type: "string", description: "The absolute path to the file to modify" },
            old_string: { type: "string", description: "The text to replace" },
            new_string: {
                type: "string",
                description: "The text to replace it with (must be different from old_string)",
            },
            replace_all: {
                type: "boolean",
                default: false,
                description: "Replace all occurrences of old_string (default false)",
            },
        },
        required: ["file_path", "old_string", "new_string"],
        additionalProperties: false,
    },
    run: async (args) => {
        const p = requireAbs(args.file_path, "file_path");
        if (typeof p !== "string") return p;
        const oldStr = String(args.old_string ?? "");
        const newStr = String(args.new_string ?? "");
        if (oldStr === newStr) return err("old_string and new_string are identical");
        const replaceAll = args.replace_all === true;
        try {
            const text = await fs.readFile(p, "utf-8");
            if (replaceAll) {
                if (!text.includes(oldStr)) return err("old_string not found in file");
                const updated = text.split(oldStr).join(newStr);
                const count = text.split(oldStr).length - 1;
                await fs.writeFile(p, updated, "utf-8");
                return ok(`Replaced ${count} occurrence(s) in ${p}`);
            }
            const idx = text.indexOf(oldStr);
            if (idx === -1) return err("old_string not found in file");
            const second = text.indexOf(oldStr, idx + 1);
            if (second !== -1) {
                return err(
                    "old_string is not unique. Provide more surrounding context or set replace_all=true."
                );
            }
            const updated = text.slice(0, idx) + newStr + text.slice(idx + oldStr.length);
            await fs.writeFile(p, updated, "utf-8");
            return ok(`Edited ${p}`);
        } catch (e) {
            return err(`Edit failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
};

// ─────────────────────────── LS ───────────────────────────
export const lsTool: ClientToolDefinition = {
    name: "LS",
    description:
        "Lists files and directories in a given path. path must be absolute. Optional ignore patterns filter results.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "The directory to list" },
            ignore: {
                type: "array",
                items: { type: "string" },
                description: "Optional glob patterns to ignore (e.g. ['node_modules', '*.log'])",
            },
        },
        required: ["path"],
        additionalProperties: false,
    },
    run: async (args) => {
        const p = requireAbs(args.path, "path");
        if (typeof p !== "string") return p;
        try {
            if (!existsSync(p)) return err(`Path does not exist: ${p}`);
            const stat = statSync(p);
            if (!stat.isDirectory()) return err(`Path is not a directory: ${p}`);
            const ignores = Array.isArray(args.ignore)
                ? (args.ignore as unknown[]).filter((x): x is string => typeof x === "string")
                : [];
            const entries = readdirSync(p, { withFileTypes: true });
            const lines: string[] = [];
            for (const entry of entries) {
                if (ignores.some((pat) => matchSimple(entry.name, pat))) continue;
                lines.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
            }
            lines.sort();
            return ok(lines.length ? lines.join("\n") : "(empty directory)");
        } catch (e) {
            return err(`LS failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
};

function matchSimple(name: string, pattern: string): boolean {
    // very basic glob: '*' wildcard, otherwise exact match
    if (!pattern.includes("*")) return name === pattern;
    const re = new RegExp(
        "^" +
            pattern
                .split("*")
                .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
                .join(".*") +
            "$"
    );
    return re.test(name);
}

// ─────────────────────────── Glob ───────────────────────────
export const globTool: ClientToolDefinition = {
    name: "Glob",
    description:
        "Fast file-pattern matching. Supports ** and *. Returns matching paths sorted by mtime (newest first).",
    parameters: {
        type: "object",
        properties: {
            pattern: { type: "string", description: "The glob pattern to match files against" },
            path: {
                type: "string",
                description:
                    "Directory to search in. Defaults to current working directory. Omit for default; do not pass 'undefined'/'null'.",
            },
        },
        required: ["pattern"],
        additionalProperties: false,
    },
    run: async (args) => {
        const pattern = String(args.pattern ?? "").trim();
        if (!pattern) return err("pattern is required");
        const cwd =
            typeof args.path === "string" && args.path.trim() && isAbsolute(args.path.trim())
                ? args.path.trim()
                : process.env.USER_CWD || process.cwd();
        try {
            const matches = await globAsync(pattern, {
                cwd,
                nodir: false,
                dot: false,
                absolute: true,
            });
            // sort by mtime desc
            const withStat = matches
                .map((m) => {
                    try {
                        return { p: m, mtime: statSync(m).mtimeMs };
                    } catch {
                        return { p: m, mtime: 0 };
                    }
                })
                .sort((a, b) => b.mtime - a.mtime);
            const out = withStat.map((x) => x.p).slice(0, 1000);
            return ok(out.length ? out.join("\n") : "(no matches)");
        } catch (e) {
            return err(`Glob failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
};

// ─────────────────────────── Grep ───────────────────────────
export const grepTool: ClientToolDefinition = {
    name: "Grep",
    description:
        "Search file contents using ripgrep (rg). Pattern is a regex. " +
        "output_mode=files_with_matches (default), content (with -A/-B/-C), or count.",
    parameters: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "The regular expression pattern to search for in file contents",
            },
            path: {
                type: "string",
                description: "File or directory to search in. Defaults to current working directory.",
            },
            glob: {
                type: "string",
                description: "Glob pattern to filter files (e.g. '*.ts').",
            },
            output_mode: {
                type: "string",
                enum: ["content", "files_with_matches", "count"],
                description:
                    "Defaults to 'files_with_matches'. 'content' supports context flags. 'count' shows match counts.",
            },
            "-B": { type: "number", description: "Lines before each match (rg -B)." },
            "-A": { type: "number", description: "Lines after each match (rg -A)." },
            "-C": { type: "number", description: "Alias for context." },
            context: { type: "number", description: "Lines around each match (rg -C)." },
            "-n": { type: "boolean", description: "Show line numbers (default true for content)." },
            "-i": { type: "boolean", description: "Case insensitive (rg -i)." },
            type: {
                type: "string",
                description: "File type filter (rg --type, e.g. 'js', 'py', 'ts').",
            },
            head_limit: {
                type: "number",
                description: "Limit output to first N lines/entries.",
            },
            multiline: { type: "boolean", description: "Enable multiline mode (rg -U --multiline-dotall)." },
        },
        required: ["pattern"],
        additionalProperties: false,
    },
    run: async (args, ctx) => {
        const pattern = String(args.pattern ?? "");
        if (!pattern) return err("pattern is required");
        const cwd = process.env.USER_CWD || process.cwd();
        const target =
            typeof args.path === "string" && args.path.trim() ? args.path.trim() : cwd;
        const mode = (args.output_mode as string) || "files_with_matches";
        const rgArgs: string[] = ["--no-heading"];
        if (mode === "files_with_matches") rgArgs.push("-l");
        else if (mode === "count") rgArgs.push("-c");
        else {
            // content
            const showLines = args["-n"] !== false;
            if (showLines) rgArgs.push("-n");
            if (typeof args["-A"] === "number") rgArgs.push("-A", String(args["-A"]));
            if (typeof args["-B"] === "number") rgArgs.push("-B", String(args["-B"]));
            const ctxN =
                typeof args["-C"] === "number" ? args["-C"] : typeof args.context === "number" ? args.context : undefined;
            if (typeof ctxN === "number") rgArgs.push("-C", String(ctxN));
        }
        if (args["-i"] === true) rgArgs.push("-i");
        if (args.multiline === true) rgArgs.push("-U", "--multiline-dotall");
        if (typeof args.type === "string" && args.type) rgArgs.push("--type", args.type);
        if (typeof args.glob === "string" && args.glob) rgArgs.push("--glob", args.glob);
        rgArgs.push("-e", pattern, target);

        return new Promise<ToolRunResult>((resolveOut) => {
            const child = spawn("rg", rgArgs, { cwd, env: process.env });
            let buf = "";
            let bytes = 0;
            const max = MAX_BYTES;
            child.stdout.on("data", (c: Buffer) => {
                if (bytes >= max) return;
                const slice = c.slice(0, max - bytes);
                bytes += slice.length;
                buf += slice.toString("utf-8");
            });
            child.stderr.on("data", () => {
                /* ignore — rg writes errors here we surface at exit */
            });
            child.on("error", (e) =>
                resolveOut(err(`Grep spawn failed (rg installed?): ${e.message}`))
            );
            child.on("close", (code) => {
                if (code === 1 && !buf.trim()) {
                    resolveOut(ok("(no matches)"));
                    return;
                }
                if (code !== 0 && code !== 1) {
                    resolveOut(err(`rg exited ${code}`));
                    return;
                }
                let lines = buf.split(/\r?\n/).filter((l) => l.length);
                if (typeof args.head_limit === "number" && args.head_limit > 0) {
                    lines = lines.slice(0, args.head_limit);
                }
                resolveOut(ok(lines.join("\n") || "(no matches)"));
            });
            ctx.signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
        });
    },
};

// ─────────────────────────── TodoWrite ───────────────────────────
//
// Stores an in-memory todo list per process. Letta-code uses this to track
// the agent's working plan; we mirror the behavior so the agent can call it.
// The list is rendered into the next return value so the agent can read it
// back if needed.
const todoListByConv = new Map<string, Array<{ content: string; status: string; activeForm: string }>>();

export const todoWriteTool: ClientToolDefinition = {
    name: "TodoWrite",
    description:
        "Maintain a structured task list for the current session. Replaces the entire list with the provided todos. " +
        "Each item has content (imperative), status (pending|in_progress|completed), and activeForm (present continuous).",
    parameters: {
        type: "object",
        properties: {
            todos: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        content: { type: "string", minLength: 1 },
                        status: {
                            type: "string",
                            enum: ["pending", "in_progress", "completed"],
                        },
                        activeForm: { type: "string", minLength: 1 },
                    },
                    required: ["content", "status", "activeForm"],
                    additionalProperties: false,
                },
                description: "The updated todo list",
            },
        },
        required: ["todos"],
        additionalProperties: false,
    },
    run: async (args, ctx) => {
        const todos = Array.isArray(args.todos) ? args.todos : [];
        const normalized = todos
            .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
            .map((t) => ({
                content: String(t.content ?? ""),
                status: String(t.status ?? "pending"),
                activeForm: String(t.activeForm ?? ""),
            }));
        const key = ctx.conversationId ?? "default";
        todoListByConv.set(key, normalized);
        const lines = normalized.map((t, i) => {
            const mark =
                t.status === "completed" ? "✓" : t.status === "in_progress" ? "→" : "·";
            return `${mark} ${i + 1}. ${t.content} [${t.status}]`;
        });
        return ok(`Todos updated (${normalized.length}):\n${lines.join("\n") || "(empty)"}`);
    },
};

// Re-export used `resolve`/`relative` to silence unused-import lints if any
export const _internal = { resolve, relative, join };
