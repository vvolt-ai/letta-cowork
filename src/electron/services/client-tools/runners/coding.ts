import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from "../types.js";
import { redactRuntimeSecrets } from "./_shared/runtime-secrets.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 32_000;
const STORE_DIR = join(homedir(), ".letta", "cowork-tools");
const LIVE_PATCH_FILE = join(STORE_DIR, "live-patch-proposals.json");
const AGENT_TOUCHED_FILE = join(STORE_DIR, "agent-touched-files.json");

interface LivePatchProposal {
  id: string;
  title: string;
  summary: string;
  repoRoot: string;
  patch: string;
  files: string[];
  riskLevel: "low" | "medium" | "high";
  validationPlan: string[];
  status: "pending" | "applied" | "rejected";
  createdAt: string;
  updatedAt: string;
  agentId?: string;
  conversationId?: string;
}

interface AgentTouchedStore {
  entries: Array<{
    repoRoot: string;
    file: string;
    source: string;
    proposalId?: string;
    touchedAt: string;
    agentId?: string;
    conversationId?: string;
  }>;
}

function cwd(): string {
  return process.env.USER_CWD || process.env.HOME || process.env.USERPROFILE || process.cwd();
}

function truncate(text: string, max = MAX_OUTPUT): string {
  return text.length > max ? `${text.slice(0, max)}\n[truncated to ${max} chars]` : text;
}

function ok(output: string): ToolRunResult {
  return { output, isError: false };
}

function fail(error: unknown): ToolRunResult {
  return { output: error instanceof Error ? error.message : String(error), isError: true };
}

async function run(
  command: string,
  args: string[],
  options?: { cwd?: string; timeout?: number; runtimeEnv?: ToolRunContext["runtimeEnv"] },
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options?.cwd ?? cwd(),
      timeout: options?.timeout ?? 120_000,
      maxBuffer: 20 * 1024 * 1024,
      env: {
        ...process.env,
        ...options?.runtimeEnv,
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
      },
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "(no output)";
    return truncate(redactRuntimeSecrets(output, options?.runtimeEnv));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactRuntimeSecrets(message, options?.runtimeEnv));
  }
}

async function gitRoot(start = cwd()): Promise<string> {
  try {
    return (await run("git", ["rev-parse", "--show-toplevel"], { cwd: start })).trim();
  } catch {
    return resolve(start);
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

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function readPackage(root: string): Promise<Record<string, unknown> | undefined> {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  return JSON.parse(await fs.readFile(pkgPath, "utf-8")) as Record<string, unknown>;
}

function detectPackageManager(root: string): string {
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

function runCommandForPackageManager(pm: string): string {
  if (pm === "bun") return "bun";
  if (pm === "pnpm") return "pnpm";
  if (pm === "yarn") return "yarn";
  return "npm";
}

function runArgsForScript(pm: string, script: string, args: string[]): string[] {
  if (pm === "npm") return ["run", script, ...(args.length ? ["--", ...args] : [])];
  if (pm === "yarn") return [script, ...args];
  return ["run", script, ...args];
}

function inferFrameworks(pkg: Record<string, unknown> | undefined, root: string): string[] {
  const deps = {
    ...((pkg?.dependencies as Record<string, string> | undefined) ?? {}),
    ...((pkg?.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  const frameworks = new Set<string>();
  if (deps["electron"]) frameworks.add("Electron");
  if (deps["react"]) frameworks.add("React");
  if (deps["vite"] || existsSync(join(root, "vite.config.ts"))) frameworks.add("Vite");
  if (deps["@nestjs/core"] || existsSync(join(root, "nest-cli.json"))) frameworks.add("NestJS");
  if (deps["jest"] || pkg?.jest) frameworks.add("Jest");
  if (deps["typescript"] || existsSync(join(root, "tsconfig.json"))) frameworks.add("TypeScript");
  if (deps["typeorm"]) frameworks.add("TypeORM");
  return Array.from(frameworks);
}

async function walkFiles(root: string, startDir: string, max = 500): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string): Promise<void> {
    if (results.length >= max || !existsSync(dir)) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else results.push(relative(root, full));
      if (results.length >= max) return;
    }
  }
  await walk(startDir);
  return results;
}

async function listFiles(root: string, max = 500): Promise<string[]> {
  try {
    const out = await run("git", ["ls-files"], { cwd: root, timeout: 60_000 });
    return out.split(/\r?\n/).filter(Boolean).slice(0, max);
  } catch {
    return walkFiles(root, root, max);
  }
}

function classifyFile(path: string): string {
  const name = basename(path);
  if (["package.json", "tsconfig.json", "vite.config.ts", "electron-builder.json", "eslint.config.js"].includes(name)) return "config";
  if (/\.spec\.|\.test\.|__tests__/.test(path)) return "test";
  if (/main|index|app|server/i.test(name)) return "entrypoint";
  if (/component|\.tsx$/i.test(path)) return "component";
  if (/service|runner|tool/i.test(path)) return "service";
  if (/README|docs?\//i.test(path)) return "doc";
  return "unknown";
}

function extractPatchFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const match = /^(?:\+\+\+|---)\s+(?:[ab]\/(.+)|(.+))$/.exec(line);
    if (!match) continue;
    const file = (match[1] || match[2] || "").trim();
    if (!file || file === "/dev/null") continue;
    files.add(file);
  }
  return Array.from(files).filter((file) => !file.includes("..") && !file.startsWith("/"));
}

async function recordTouched(repoRoot: string, files: string[], source: string, options?: { proposalId?: string; agentId?: string; conversationId?: string }): Promise<void> {
  const store = await readJson<AgentTouchedStore>(AGENT_TOUCHED_FILE, { entries: [] });
  const now = new Date().toISOString();
  for (const file of files) {
    store.entries.push({ repoRoot, file, source, proposalId: options?.proposalId, touchedAt: now, agentId: options?.agentId, conversationId: options?.conversationId });
  }
  store.entries = store.entries.slice(-2000);
  await writeJson(AGENT_TOUCHED_FILE, store);
}

export async function noteToolTouchedFiles(startPath: string, files: string[], source: string, options?: { agentId?: string; conversationId?: string }): Promise<void> {
  const repoRoot = await gitRoot(startPath || cwd());
  const normalized = files
    .filter(Boolean)
    .map((file) => (file.startsWith(repoRoot) ? relative(repoRoot, file) : file))
    .filter((file) => !file.includes("..") && !file.startsWith("/"));
  if (normalized.length === 0) return;
  await recordTouched(repoRoot, Array.from(new Set(normalized)), source, options);
}

async function applyPatchFile(repoRoot: string, patch: string): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), "cowork-patch-"));
  const patchPath = join(dir, "proposal.patch");
  await fs.writeFile(patchPath, patch, "utf-8");
  try {
    await run("git", ["apply", "--check", patchPath], { cwd: repoRoot, timeout: 60_000 });
    return await run("git", ["apply", patchPath], { cwd: repoRoot, timeout: 60_000 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const projectDetectTool: ClientToolDefinition = {
  name: "ProjectDetect",
  description: "Detect project type, repo root, package manager, scripts, frameworks, key directories, and testing/build capabilities. Use at the start of coding tasks instead of guessing commands.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Project path. Defaults to current working directory." } },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const start = resolve(asString(args.path, cwd()));
      const root = await gitRoot(start);
      const pkg = await readPackage(root);
      const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
      const packageManager = detectPackageManager(root);
      const entries = existsSync(root) ? await fs.readdir(root) : [];
      const result = {
        cwd: start,
        repoRoot: root,
        packageManager,
        packageCommand: runCommandForPackageManager(packageManager),
        name: pkg?.name ?? basename(root),
        frameworks: inferFrameworks(pkg, root),
        scripts,
        importantDirs: entries.filter((entry) => ["src", "test", "tests", "docs", "scripts", "packages", "services", "apps"].includes(entry)),
        hasGit: existsSync(join(root, ".git")),
      };
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const projectMapTool: ClientToolDefinition = {
  name: "ProjectMap",
  description: "Create a compact Aider-style project map of important files, roles, configs, tests, and entrypoints. Use for planning before broad code changes.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Project path. Defaults to current working directory." },
      limit: { type: "number", description: "Maximum files to include. Default 200." },
    },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const root = await gitRoot(resolve(asString(args.path, cwd())));
      const files = await listFiles(root, Math.min(Math.max(Number(args.limit) || 200, 20), 1000));
      const mapped = files.map((file) => ({ path: file, role: classifyFile(file) }));
      const result = {
        repoRoot: root,
        entrypoints: mapped.filter((f) => f.role === "entrypoint").map((f) => f.path).slice(0, 30),
        configs: mapped.filter((f) => f.role === "config").map((f) => f.path).slice(0, 40),
        tests: mapped.filter((f) => f.role === "test").map((f) => f.path).slice(0, 50),
        importantFiles: mapped.filter((f) => f.role !== "unknown").slice(0, 200),
      };
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const projectRunScriptTool: ClientToolDefinition = {
  name: "ProjectRunScript",
  description: "Run a package.json script using the detected package manager and return a compact result. Prefer this over Bash for builds, tests, lint, typecheck, and project scripts.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Project path. Defaults to current working directory." },
      script: { type: "string", description: "package.json script name to run." },
      args: { type: "array", items: { type: "string" }, description: "Optional script arguments." },
      timeoutMs: { type: "number", description: "Timeout in ms. Default 300000, max 900000." },
    },
    required: ["script"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.path, cwd())));
      const script = asString(args.script).trim();
      if (!script) return fail("script is required");
      const pkg = await readPackage(root);
      const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
      if (!scripts[script]) return fail(`Script '${script}' not found. Available scripts: ${Object.keys(scripts).join(", ") || "none"}`);
      const pm = detectPackageManager(root);
      const command = runCommandForPackageManager(pm);
      const commandArgs = runArgsForScript(pm, script, asStringArray(args.args));
      const started = Date.now();
      try {
        const output = await run(command, commandArgs, {
          cwd: root,
          timeout: Math.min(Math.max(Number(args.timeoutMs) || 300_000, 1000), 900_000),
          runtimeEnv: ctx.runtimeEnv,
        });
        return ok(JSON.stringify({ command: `${command} ${commandArgs.join(" ")}`, status: "success", durationMs: Date.now() - started, output }, null, 2));
      } catch (e) {
        return ok(JSON.stringify({ command: `${command} ${commandArgs.join(" ")}`, status: "failed", durationMs: Date.now() - started, output: e instanceof Error ? e.message : String(e) }, null, 2));
      }
    } catch (e) {
      return fail(e);
    }
  },
};

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DOUBLE_STAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLE_STAR§/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

function matchesGlob(file: string, glob?: string): boolean {
  if (!glob?.trim()) return true;
  if (glob.includes("{")) {
    const match = /^(.*)\{(.+)\}(.*)$/.exec(glob);
    if (match) return match[2].split(",").some((part) => matchesGlob(file, `${match[1]}${part}${match[3]}`));
  }
  return globToRegExp(glob).test(file);
}

async function fallbackSearch(root: string, pattern: string, options: { glob?: string; symbol?: boolean; limit?: number }): Promise<string> {
  const files = (await listFiles(root, 3000)).filter((file) => matchesGlob(file, options.glob));
  const matcher = options.symbol
    ? new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)
    : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const lines: string[] = [];
  const max = Math.min(Math.max(options.limit || 200, 1), 1000);
  for (const file of files) {
    if (lines.length >= max) break;
    const full = join(root, file);
    if (!existsSync(full) || !/[.](ts|tsx|cts|mts|js|jsx|cjs|mjs|json|md|mdx|css|scss|html|txt|yaml|yml)$/i.test(file)) continue;
    const content = await fs.readFile(full, "utf-8").catch(() => "");
    content.split(/\r?\n/).forEach((line, index) => {
      if (lines.length < max && matcher.test(line)) lines.push(`${file}:${index + 1}:1:${line.trim()}`);
    });
  }
  return lines.join("\n") || "No matches";
}

function outlineLine(line: string, index: number): { line: number; kind: string; name: string } | null {
  const patterns: Array<[RegExp, string]> = [
    [/^\s*export\s+default\s+function\s+([A-Za-z0-9_$]+)/, "function"],
    [/^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, "function"],
    [/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)/, "function"],
    [/^\s*export\s+class\s+([A-Za-z0-9_$]+)/, "class"],
    [/^\s*class\s+([A-Za-z0-9_$]+)/, "class"],
    [/^\s*export\s+interface\s+([A-Za-z0-9_$]+)/, "interface"],
    [/^\s*interface\s+([A-Za-z0-9_$]+)/, "interface"],
    [/^\s*export\s+type\s+([A-Za-z0-9_$]+)/, "type"],
    [/^\s*type\s+([A-Za-z0-9_$]+)/, "type"],
    [/^\s*export\s+const\s+([A-Za-z0-9_$]+)/, "const"],
    [/^\s*const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/, "function"],
  ];
  for (const [pattern, kind] of patterns) {
    const match = pattern.exec(line);
    if (match) return { line: index + 1, kind, name: match[1] };
  }
  return null;
}

const codeFileOutlineTool: ClientToolDefinition = {
  name: "CodeFileOutline",
  description: "Return a compact outline of a source file: imports, exports, classes, functions, interfaces, types, and important constants. Use before editing large files.",
  parameters: {
    type: "object",
    properties: { file: { type: "string", description: "Source file path." }, maxSymbols: { type: "number", description: "Maximum symbols. Default 100." } },
    required: ["file"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const file = resolve(cwd(), asString(args.file));
      const text = await fs.readFile(file, "utf-8");
      const lines = text.split(/\r?\n/);
      const maxSymbols = Math.min(Math.max(Number(args.maxSymbols) || 100, 1), 500);
      const imports = lines.filter((line) => /^\s*import\s/.test(line)).slice(0, 50);
      const exports = lines.filter((line) => /^\s*export\s/.test(line)).slice(0, 100);
      const symbols = lines.map(outlineLine).filter((item): item is { line: number; kind: string; name: string } => Boolean(item)).slice(0, maxSymbols);
      return ok(JSON.stringify({ file, lineCount: lines.length, imports, exports, symbols }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const codeSearchTool: ClientToolDefinition = {
  name: "CodeSearch",
  description: "Search code with ripgrep and return compact matches. Prefer this over Bash grep/find for code discovery.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      path: { type: "string", description: "Repo/path to search. Defaults to cwd." },
      glob: { type: "string", description: "Optional glob, e.g. **/*.ts." },
      mode: { type: "string", enum: ["text", "symbol", "hybrid"] },
      limit: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  run: async (args) => {
    const start = resolve(asString(args.path, cwd()));
    const searchStart = existsSync(start) && statSync(start).isFile() ? dirname(start) : start;
    const root = await gitRoot(searchStart);
    const query = asString(args.query);
    const mode = asString(args.mode, "hybrid");
    const glob = typeof args.glob === "string" && args.glob.trim() ? args.glob.trim() : undefined;
    const outputLimit = Math.min(Math.max(Number(args.limit) || 16000, 1000), 50000);

    async function runFallback(): Promise<ToolRunResult> {
      const fallback = await fallbackSearch(root, query, {
        glob,
        symbol: mode === "symbol",
        limit: Number(args.limit) || 200,
      });
      return ok(truncate(fallback, outputLimit));
    }

    try {
      if (!query.trim()) return fail("query is required");
      const pattern = mode === "symbol" ? `\\b${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b` : query;
      const rgArgs = ["--line-number", "--column", "--no-heading", "--color", "never", "--max-count", "20"];
      if (glob) rgArgs.push("--glob", glob);
      rgArgs.push("--regexp", pattern, ".");
      const output = await run("rg", rgArgs, { cwd: root, timeout: 60_000 });
      const trimmed = output === "(no output)" ? "" : output.trim();
      if (!trimmed) return runFallback();
      return ok(truncate(trimmed, outputLimit));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/ENOENT|spawn rg/.test(message)) return runFallback();
      if (/exit code 1|Command failed/.test(message)) return runFallback();
      return fail(e);
    }
  },
};

const codeFindReferencesTool: ClientToolDefinition = {
  name: "CodeFindReferences",
  description: "Find likely references to a symbol using code search. LSP-backed implementation can replace this fallback later.",
  parameters: { type: "object", properties: { symbol: { type: "string" }, path: { type: "string" }, limit: { type: "number" } }, required: ["symbol"], additionalProperties: false },
  run: async (args) => codeSearchTool.run({ query: asString(args.symbol), path: args.path, mode: "symbol", limit: args.limit }, { signal: new AbortController().signal }),
};

const codeGetDefinitionTool: ClientToolDefinition = {
  name: "CodeGetDefinition",
  description: "Find likely definitions for a symbol using export/function/class/interface/type patterns. LSP-backed implementation can replace this fallback later.",
  parameters: { type: "object", properties: { symbol: { type: "string" }, path: { type: "string" }, limit: { type: "number" } }, required: ["symbol"], additionalProperties: false },
  run: async (args) => {
    const symbol = asString(args.symbol);
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `(export\\s+)?(async\\s+)?(function|class|interface|type|const|let|var)\\s+${escaped}\\b`;
    return codeSearchTool.run({ query: pattern, path: args.path, mode: "text", limit: args.limit, glob: "**/*.{ts,tsx,js,jsx}" }, { signal: new AbortController().signal });
  },
};

const codeDiagnosticsTool: ClientToolDefinition = {
  name: "CodeDiagnostics",
  description: "Run the smallest available project diagnostic command and return compact TypeScript/build errors. Prefer before/after coding edits.",
  parameters: { type: "object", properties: { path: { type: "string" }, script: { type: "string", description: "Optional script override, e.g. build or transpile:electron." }, timeoutMs: { type: "number" } }, additionalProperties: false },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.path, cwd())));
      const pkg = await readPackage(root);
      const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
      const preferred = asString(args.script) || (scripts["transpile:electron"] ? "transpile:electron" : scripts["typecheck"] ? "typecheck" : scripts["build"] ? "build" : "");
      if (preferred) return projectRunScriptTool.run({ path: root, script: preferred, timeoutMs: args.timeoutMs }, ctx);
      if (existsSync(join(root, "tsconfig.json"))) {
        const output = await run("npx", ["tsc", "--noEmit"], {
          cwd: root,
          timeout: Math.min(Math.max(Number(args.timeoutMs) || 300_000, 1000), 900_000),
          runtimeEnv: ctx.runtimeEnv,
        });
        return ok(JSON.stringify({ command: "npx tsc --noEmit", status: "success", output }, null, 2));
      }
      return fail("No diagnostic script or tsconfig.json found.");
    } catch (e) {
      return ok(JSON.stringify({ status: "failed", output: e instanceof Error ? e.message : String(e) }, null, 2));
    }
  },
};

const projectMemoryStatusTool: ClientToolDefinition = {
  name: "ProjectMemoryStatus",
  description: "Inspect repo-local Cowork project memory under .cowork/. Use before asking the user to repeat project context.",
  parameters: { type: "object", properties: { projectPath: { type: "string" } }, additionalProperties: false },
  run: async (args) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const base = join(root, ".cowork");
      const files: string[] = [];
      async function walk(dir: string): Promise<void> {
        if (!existsSync(dir)) return;
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else files.push(relative(root, full));
        }
      }
      await walk(base);
      return ok(JSON.stringify({ repoRoot: root, hasProjectProfile: existsSync(join(base, "project.md")), memoryFiles: files.sort() }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const projectMemoryReadTool: ClientToolDefinition = {
  name: "ProjectMemoryRead",
  description: "Read a repo-local Cowork project memory file. Use for durable project architecture, decisions, testing rules, gotchas, and current work context.",
  parameters: {
    type: "object",
    properties: { projectPath: { type: "string" }, file: { type: "string", description: "Memory file path under .cowork/, e.g. project.md or memory/decisions.md." } },
    required: ["file"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const file = asString(args.file);
      if (!file || file.includes("..") || file.startsWith("/")) return fail("file must be a relative path under .cowork/");
      const target = join(root, ".cowork", file);
      return ok(truncate(await fs.readFile(target, "utf-8")));
    } catch (e) {
      return fail(e);
    }
  },
};

const projectMemoryWriteTool: ClientToolDefinition = {
  name: "ProjectMemoryWrite",
  description: "Append or update repo-local Cowork project memory. Save distilled durable facts only: architecture, decisions, workflows, testing rules, gotchas. Do not save secrets or raw transcripts.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string" },
      file: { type: "string", description: "Path under .cowork/, e.g. memory/decisions.md." },
      content: { type: "string" },
      mode: { type: "string", enum: ["append", "overwrite"], description: "Default append." },
    },
    required: ["file", "content"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const file = asString(args.file);
      const content = asString(args.content);
      if (!file || file.includes("..") || file.startsWith("/")) return fail("file must be a relative path under .cowork/");
      if (!content.trim()) return fail("content is required");
      if (/secret|password|token|api[_-]?key/i.test(file) || /BEGIN (RSA|OPENSSH|PRIVATE) KEY|api[_-]?key\s*=|password\s*=/i.test(content)) {
        return fail("Refusing to write likely secret material to project memory.");
      }
      const target = join(root, ".cowork", file);
      await fs.mkdir(dirname(target), { recursive: true });
      if (args.mode === "overwrite") await fs.writeFile(target, content, "utf-8");
      else await fs.appendFile(target, `${content.endsWith("\n") ? content : `${content}\n`}`, "utf-8");
      return ok(`Wrote project memory: ${relative(root, target)}`);
    } catch (e) {
      return fail(e);
    }
  },
};

const projectMemorySearchTool: ClientToolDefinition = {
  name: "ProjectMemorySearch",
  description: "Search repo-local Cowork project memory and common docs before asking the user to repeat context.",
  parameters: {
    type: "object",
    properties: { projectPath: { type: "string" }, query: { type: "string" }, limit: { type: "number" } },
    required: ["query"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const query = asString(args.query).toLowerCase();
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      const tracked = await listFiles(root, 2000);
      const coworkFiles = await walkFiles(root, join(root, ".cowork"), 1000);
      const candidates = Array.from(new Set([...tracked, ...coworkFiles])).filter((file) =>
        file.startsWith(".cowork/") || file.toLowerCase().includes("readme") || file.startsWith("docs/") || file === "AGENT-README.md"
      );
      const matches: Array<{ file: string; line: number; text: string }> = [];
      for (const file of candidates) {
        if (matches.length >= limit) break;
        const full = join(root, file);
        if (!existsSync(full) || extname(full) && !/[.](md|txt|json|ts|tsx|js)$/i.test(full)) continue;
        const lines = (await fs.readFile(full, "utf-8")).split(/\r?\n/);
        lines.forEach((line, index) => {
          if (matches.length < limit && line.toLowerCase().includes(query)) matches.push({ file, line: index + 1, text: line.trim() });
        });
      }
      return ok(JSON.stringify(matches, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const liveProposePatchTool: ClientToolDefinition = {
  name: "LiveProposePatch",
  description: "Create a live file-edit patch proposal for UI review. Prefer this for multi-file or risky edits: propose diff first, then apply with LiveApplyPatch after acceptance.",
  parameters: {
    type: "object",
    properties: {
      repoPath: { type: "string" },
      title: { type: "string" },
      summary: { type: "string" },
      patch: { type: "string" },
      files: { type: "array", items: { type: "string" } },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      validationPlan: { type: "array", items: { type: "string" } },
    },
    required: ["title", "summary", "patch"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const repoRoot = await gitRoot(resolve(asString(args.repoPath, cwd())));
      const patch = asString(args.patch);
      const files = asStringArray(args.files).length ? asStringArray(args.files) : extractPatchFiles(patch);
      if (!patch.trim()) return fail("patch is required");
      if (files.length === 0) return fail("Could not determine files from patch; pass files explicitly.");
      const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
      const now = new Date().toISOString();
      const proposal: LivePatchProposal = {
        id: `patch-${Date.now()}`,
        title: asString(args.title),
        summary: asString(args.summary),
        repoRoot,
        patch,
        files,
        riskLevel: ["low", "medium", "high"].includes(asString(args.riskLevel)) ? asString(args.riskLevel) as "low" | "medium" | "high" : "medium",
        validationPlan: asStringArray(args.validationPlan),
        status: "pending",
        createdAt: now,
        updatedAt: now,
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
      };
      proposals.push(proposal);
      await writeJson(LIVE_PATCH_FILE, proposals.slice(-500));
      return ok(JSON.stringify({ proposalId: proposal.id, status: proposal.status, files: proposal.files, riskLevel: proposal.riskLevel, summary: proposal.summary }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const liveApplyPatchTool: ClientToolDefinition = {
  name: "LiveApplyPatch",
  description: "Apply a pending LiveProposePatch proposal after the user accepts it. Records applied files as agent-touched for safe git commits.",
  parameters: { type: "object", properties: { proposalId: { type: "string" } }, required: ["proposalId"], additionalProperties: false },
  run: async (args, ctx) => {
    try {
      const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
      const proposal = proposals.find((item) => item.id === args.proposalId);
      if (!proposal) return fail("proposal not found");
      if (proposal.status !== "pending") return fail(`proposal is ${proposal.status}, not pending`);
      const output = await applyPatchFile(proposal.repoRoot, proposal.patch);
      proposal.status = "applied";
      proposal.updatedAt = new Date().toISOString();
      await writeJson(LIVE_PATCH_FILE, proposals);
      await recordTouched(proposal.repoRoot, proposal.files, "LiveApplyPatch", { proposalId: proposal.id, agentId: ctx.agentId, conversationId: ctx.conversationId });
      return ok(JSON.stringify({ proposalId: proposal.id, status: proposal.status, files: proposal.files, output }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const liveRejectPatchTool: ClientToolDefinition = {
  name: "LiveRejectPatch",
  description: "Reject a pending live patch proposal without changing files.",
  parameters: { type: "object", properties: { proposalId: { type: "string" }, reason: { type: "string" } }, required: ["proposalId"], additionalProperties: false },
  run: async (args) => {
    try {
      const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
      const proposal = proposals.find((item) => item.id === args.proposalId);
      if (!proposal) return fail("proposal not found");
      proposal.status = "rejected";
      proposal.updatedAt = new Date().toISOString();
      await writeJson(LIVE_PATCH_FILE, proposals);
      return ok(JSON.stringify({ proposalId: proposal.id, status: proposal.status, reason: asString(args.reason) }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const liveDiffStatusTool: ClientToolDefinition = {
  name: "LiveDiffStatus",
  description: "List live patch proposals and agent-touched files for the current repo. Use to show pending/applied edits and support safe commits.",
  parameters: { type: "object", properties: { repoPath: { type: "string" }, proposalId: { type: "string" } }, additionalProperties: false },
  run: async (args) => {
    try {
      const repoRoot = await gitRoot(resolve(asString(args.repoPath, cwd())));
      const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
      const touched = await readJson<AgentTouchedStore>(AGENT_TOUCHED_FILE, { entries: [] });
      const result = {
        repoRoot,
        proposals: proposals.filter((item) => item.repoRoot === repoRoot && (!args.proposalId || item.id === args.proposalId)).slice(-50),
        agentTouchedFiles: Array.from(new Set(touched.entries.filter((entry) => entry.repoRoot === repoRoot).map((entry) => entry.file))).sort(),
      };
      return ok(JSON.stringify(result, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const gitChangedByAgentTool: ClientToolDefinition = {
  name: "GitChangedByAgent",
  description: "Show files touched by Cowork coding tools versus unrelated dirty files. Use before staging/committing to avoid committing user changes.",
  parameters: { type: "object", properties: { repoPath: { type: "string" } }, additionalProperties: false },
  run: async (args) => {
    try {
      const repoRoot = await gitRoot(resolve(asString(args.repoPath, cwd())));
      const status = await run("git", ["status", "--short"], { cwd: repoRoot });
      const dirty = status
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.replace(/^..\s?/, "").trim().replace(/^"|"$/g, ""));
      const touched = await readJson<AgentTouchedStore>(AGENT_TOUCHED_FILE, { entries: [] });
      const agentTouched = Array.from(new Set(touched.entries.filter((entry) => entry.repoRoot === repoRoot).map((entry) => entry.file))).sort();
      const unrelatedDirty = dirty.filter((file) => !agentTouched.includes(file));
      return ok(JSON.stringify({ repoRoot, agentTouched, dirty, unrelatedDirty }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const gitDiffSummaryTool: ClientToolDefinition = {
  name: "GitDiffSummary",
  description: "Return a compact git diff summary for selected files or the whole repo. Use before final summaries and commits.",
  parameters: {
    type: "object",
    properties: { repoPath: { type: "string" }, files: { type: "array", items: { type: "string" } }, maxChars: { type: "number" } },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const repoRoot = await gitRoot(resolve(asString(args.repoPath, cwd())));
      const files = asStringArray(args.files);
      const stat = await run("git", ["diff", "--stat", ...(files.length ? ["--", ...files] : [])], { cwd: repoRoot });
      const names = await run("git", ["diff", "--name-status", ...(files.length ? ["--", ...files] : [])], { cwd: repoRoot });
      const diff = await run("git", ["diff", "--", ...files], { cwd: repoRoot });
      return ok(JSON.stringify({ repoRoot, stat, files: names, diff: truncate(diff, Math.min(Math.max(Number(args.maxChars) || 12000, 1000), 50000)) }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const logSearchTool: ClientToolDefinition = {
  name: "LogSearch",
  description: "Search a local log/text file for a pattern with optional context. Prefer this over Bash grep for debugging logs.",
  parameters: {
    type: "object",
    properties: { file_path: { type: "string" }, pattern: { type: "string" }, context: { type: "number" }, limit: { type: "number" } },
    required: ["file_path", "pattern"],
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const file = resolve(cwd(), asString(args.file_path));
      const pattern = new RegExp(asString(args.pattern), "i");
      const context = Math.min(Math.max(Number(args.context) || 0, 0), 20);
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 500);
      const lines = (await fs.readFile(file, "utf-8")).split(/\r?\n/);
      const chunks: string[] = [];
      for (let i = 0; i < lines.length && chunks.length < limit; i += 1) {
        if (!pattern.test(lines[i])) continue;
        const start = Math.max(0, i - context);
        const end = Math.min(lines.length, i + context + 1);
        chunks.push(lines.slice(start, end).map((line, offset) => `${start + offset + 1}: ${line}`).join("\n"));
      }
      return ok(truncate(chunks.join("\n---\n") || "No matches"));
    } catch (e) {
      return fail(e);
    }
  },
};

export const codingTools: ClientToolDefinition[] = [
  projectDetectTool,
  projectMapTool,
  codeFileOutlineTool,
  codeSearchTool,
  codeGetDefinitionTool,
  codeFindReferencesTool,
  codeDiagnosticsTool,
  projectRunScriptTool,
  projectMemoryStatusTool,
  projectMemoryReadTool,
  projectMemoryWriteTool,
  projectMemorySearchTool,
  liveProposePatchTool,
  liveApplyPatchTool,
  liveRejectPatchTool,
  liveDiffStatusTool,
  gitChangedByAgentTool,
  gitDiffSummaryTool,
  logSearchTool,
];
