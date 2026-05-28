import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from "../types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 32_000;
const STORE_DIR = join(homedir(), ".letta", "cowork-tools");
const NOTES_FILE = join(STORE_DIR, "memory-notes.json");
const PREFS_FILE = join(STORE_DIR, "user-preferences.json");
const REMINDERS_FILE = join(STORE_DIR, "reminders.json");

function cwd(): string {
  return process.env.USER_CWD || process.env.HOME || process.env.USERPROFILE || process.cwd();
}

function truncate(text: string, max = MAX_OUTPUT): string {
  return text.length > max ? `${text.slice(0, max)}\n[truncated to ${max} chars]` : text;
}

async function run(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd: options?.cwd ?? cwd(),
    timeout: options?.timeout ?? 60_000,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
  });
  return truncate(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "(no output)");
}

async function gitRoot(start = cwd()): Promise<string> {
  try {
    return (await run("git", ["rev-parse", "--show-toplevel"], { cwd: start })).trim();
  } catch {
    return start;
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf-8");
}

function ok(output: string): ToolRunResult {
  return { output, isError: false };
}
function fail(error: unknown): ToolRunResult {
  return { output: error instanceof Error ? error.message : String(error), isError: true };
}

export const projectContextTool: ClientToolDefinition = {
  name: "ProjectContext",
  description: "Inspect the current project/repo context: working directory, git branch/root, package scripts, and top-level files. Use before coding or answering repo-specific questions.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Optional project path. Defaults to current working directory." },
      includeScripts: { type: "boolean", description: "Include package.json scripts if present. Default true." },
    },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const start = typeof args.path === "string" && args.path.trim() ? resolve(args.path) : cwd();
      const root = await gitRoot(start);
      let branch = "";
      try { branch = (await run("git", ["branch", "--show-current"], { cwd: root })).trim(); } catch {}
      const entries = existsSync(root) ? (await fs.readdir(root)).slice(0, 80) : [];
      const pkgPath = join(root, "package.json");
      let scripts: Record<string, string> | undefined;
      if (args.includeScripts !== false && existsSync(pkgPath)) {
        const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));
        scripts = pkg.scripts ?? undefined;
      }
      return ok(JSON.stringify({ cwd: start, gitRoot: root, branch, entries, scripts }, null, 2));
    } catch (e) { return fail(e); }
  },
};

export const gitTool: ClientToolDefinition = {
  name: "Git",
  description: "Run structured git operations for status, diff, log, branch, commit, pull, and push. Mutating operations require confirm=true and should only be used after explicit user approval.",
  parameters: {
    type: "object",
    properties: {
      operation: { type: "string", enum: ["status", "diff", "log", "branch", "commit", "pull", "push"], description: "Git operation to run." },
      path: { type: "string", description: "Repo path. Defaults to current working directory." },
      file: { type: "string", description: "Optional file path for diff/status." },
      message: { type: "string", description: "Commit message for operation=commit." },
      confirm: { type: "boolean", description: "Required true for commit, pull, and push." },
      maxCount: { type: "number", description: "For log: max commits, default 10." },
    },
    required: ["operation"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const root = await gitRoot(typeof args.path === "string" ? args.path : cwd());
      const op = String(args.operation);
      const fileArgs = typeof args.file === "string" && args.file ? ["--", args.file] : [];
      if (op === "status") return ok(await run("git", ["status", "--short", ...fileArgs], { cwd: root }));
      if (op === "diff") return ok(await run("git", ["diff", "--", ...(typeof args.file === "string" && args.file ? [args.file] : [])], { cwd: root }));
      if (op === "log") return ok(await run("git", ["log", "--oneline", `-${Number(args.maxCount) > 0 ? Number(args.maxCount) : 10}`], { cwd: root }));
      if (op === "branch") return ok(await run("git", ["branch", "--show-current"], { cwd: root }));
      if (["commit", "pull", "push"].includes(op) && args.confirm !== true) {
        return fail(`Git ${op} requires confirm=true and explicit user approval.`);
      }
      if (op === "commit") {
        const message = typeof args.message === "string" && args.message.trim() ? args.message.trim() : "update from cowork agent";
        return ok(await run("git", ["commit", "-m", message], { cwd: root, timeout: 120_000 }));
      }
      if (op === "pull") return ok(await run("git", ["pull"], { cwd: root, timeout: 300_000 }));
      if (op === "push") return ok(await run("git", ["push"], { cwd: root, timeout: 300_000 }));
      return fail(`Unsupported git operation: ${op}`);
    } catch (e) { return fail(e); }
  },
};

export const logTailTool: ClientToolDefinition = {
  name: "LogTail",
  description: "Read the last lines from a local log/text file for runtime debugging. Useful for Electron/backend logs and crash output.",
  parameters: {
    type: "object",
    properties: {
      file_path: { type: "string", description: "Absolute or project-relative log file path." },
      lines: { type: "number", description: "Number of lines to return. Default 200, max 1000." },
    },
    required: ["file_path"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const p = resolve(cwd(), String(args.file_path ?? ""));
      const lineCount = Math.min(Math.max(Number(args.lines) || 200, 1), 1000);
      const text = await fs.readFile(p, "utf-8");
      return ok(truncate(text.split(/\r?\n/).slice(-lineCount).join("\n")));
    } catch (e) { return fail(e); }
  },
};

export const webFetchTool: ClientToolDefinition = {
  name: "WebFetch",
  description: "Fetch a public HTTP(S) URL and return plain text/markdown-ish content. Use for docs and public web pages; do not use for private/internal URLs.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Public http(s) URL." },
      maxChars: { type: "number", description: "Maximum characters to return. Default 20000." },
    },
    required: ["url"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const url = new URL(String(args.url ?? ""));
      if (!["http:", "https:"].includes(url.protocol)) return fail("Only http(s) URLs are allowed");
      const res = await fetch(url, { redirect: "follow" });
      const text = await res.text();
      const stripped = text
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return ok(truncate(`Status: ${res.status} ${res.statusText}\nURL: ${res.url}\n\n${stripped}`, Math.min(Math.max(Number(args.maxChars) || 20_000, 1000), 50_000)));
    } catch (e) { return fail(e); }
  },
};

interface Note { id: string; scope: string; text: string; createdAt: string; updatedAt: string; }
export const memoryNotesTool: ClientToolDefinition = {
  name: "MemoryNotes",
  description: "Persist lightweight project/user notes outside the chat. Actions: list, search, add, update, delete. Use for durable preferences, decisions, gotchas, and project context.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "search", "add", "update", "delete"] },
      id: { type: "string" },
      scope: { type: "string", description: "Scope such as project name, agent id, or global. Default global." },
      text: { type: "string" },
      query: { type: "string" },
    },
    required: ["action"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const notes = await readJson<Note[]>(NOTES_FILE, []);
      const action = String(args.action);
      const now = new Date().toISOString();
      if (action === "list") return ok(JSON.stringify(notes, null, 2));
      if (action === "search") {
        const q = String(args.query ?? "").toLowerCase();
        return ok(JSON.stringify(notes.filter(n => n.text.toLowerCase().includes(q) || n.scope.toLowerCase().includes(q)), null, 2));
      }
      if (action === "add") {
        const note: Note = { id: `note-${Date.now()}`, scope: String(args.scope ?? "global"), text: String(args.text ?? ""), createdAt: now, updatedAt: now };
        if (!note.text.trim()) return fail("text is required for add");
        notes.push(note); await writeJson(NOTES_FILE, notes); return ok(JSON.stringify(note, null, 2));
      }
      if (action === "update") {
        const note = notes.find(n => n.id === args.id); if (!note) return fail("note not found");
        if (typeof args.scope === "string") note.scope = args.scope;
        if (typeof args.text === "string") note.text = args.text;
        note.updatedAt = now; await writeJson(NOTES_FILE, notes); return ok(JSON.stringify(note, null, 2));
      }
      if (action === "delete") {
        const kept = notes.filter(n => n.id !== args.id); await writeJson(NOTES_FILE, kept); return ok(`Deleted ${notes.length - kept.length} note(s)`);
      }
      return fail(`Unsupported action: ${action}`);
    } catch (e) { return fail(e); }
  },
};

export const userPreferencesTool: ClientToolDefinition = {
  name: "UserPreferences",
  description: "Read or update persistent user response/workflow preferences such as verbosity, approval style, default build command, and preferred tools.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["get", "set", "merge", "clear"] },
      key: { type: "string" },
      value: {},
      values: { type: "object" },
    },
    required: ["action"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      let prefs = await readJson<Record<string, unknown>>(PREFS_FILE, {});
      const action = String(args.action);
      if (action === "get") return ok(JSON.stringify(typeof args.key === "string" ? prefs[args.key] ?? null : prefs, null, 2));
      if (action === "set") { if (typeof args.key !== "string") return fail("key required"); prefs[args.key] = args.value; await writeJson(PREFS_FILE, prefs); return ok(JSON.stringify(prefs, null, 2)); }
      if (action === "merge") { prefs = { ...prefs, ...((args.values && typeof args.values === "object") ? args.values as Record<string, unknown> : {}) }; await writeJson(PREFS_FILE, prefs); return ok(JSON.stringify(prefs, null, 2)); }
      if (action === "clear") { prefs = {}; await writeJson(PREFS_FILE, prefs); return ok("Preferences cleared"); }
      return fail(`Unsupported action: ${action}`);
    } catch (e) { return fail(e); }
  },
};

interface Reminder { id: string; text: string; dueAt?: string; status: "pending" | "done"; createdAt: string; }
export const remindersTool: ClientToolDefinition = {
  name: "Reminders",
  description: "Persist simple reminders/follow-ups for the user. This stores reminder state; a future scheduler can execute notifications.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["list", "add", "complete", "delete"] },
      id: { type: "string" },
      text: { type: "string" },
      dueAt: { type: "string", description: "Optional ISO timestamp or human-readable due date text." },
    },
    required: ["action"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const reminders = await readJson<Reminder[]>(REMINDERS_FILE, []);
      const action = String(args.action);
      if (action === "list") return ok(JSON.stringify(reminders, null, 2));
      if (action === "add") {
        const r: Reminder = { id: `rem-${Date.now()}`, text: String(args.text ?? ""), dueAt: typeof args.dueAt === "string" ? args.dueAt : undefined, status: "pending", createdAt: new Date().toISOString() };
        if (!r.text.trim()) return fail("text is required for add");
        reminders.push(r); await writeJson(REMINDERS_FILE, reminders); return ok(JSON.stringify(r, null, 2));
      }
      if (action === "complete") { const r = reminders.find(x => x.id === args.id); if (!r) return fail("reminder not found"); r.status = "done"; await writeJson(REMINDERS_FILE, reminders); return ok(JSON.stringify(r, null, 2)); }
      if (action === "delete") { const kept = reminders.filter(r => r.id !== args.id); await writeJson(REMINDERS_FILE, kept); return ok(`Deleted ${reminders.length - kept.length} reminder(s)`); }
      return fail(`Unsupported action: ${action}`);
    } catch (e) { return fail(e); }
  },
};

export const productivityTools: ClientToolDefinition[] = [
  projectContextTool,
  gitTool,
  logTailTool,
  webFetchTool,
  memoryNotesTool,
  userPreferencesTool,
  remindersTool,
];
