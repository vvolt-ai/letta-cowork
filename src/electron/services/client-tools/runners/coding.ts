import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { ClientToolDefinition, ToolRunContext, ToolRunResult } from "../types.js";
import { redactRuntimeSecrets } from "./_shared/runtime-secrets.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 32_000;
const STORE_DIR = join(homedir(), ".letta", "cowork-tools");
const LIVE_PATCH_FILE = join(STORE_DIR, "live-patch-proposals.json");
const AGENT_TOUCHED_FILE = join(STORE_DIR, "agent-touched-files.json");
const storeQueues = new Map<string, Promise<void>>();

export interface LivePatchProposal {
  id: string;
  title: string;
  summary: string;
  repoRoot: string;
  patch: string;
  files: string[];
  riskLevel: "low" | "medium" | "high";
  validationPlan: string[];
  status: "pending" | "applied" | "partially_applied" | "rejected" | "undone" | "superseded";
  createdAt: string;
  updatedAt: string;
  agentId?: string;
  conversationId?: string;
  rejectionReason?: string;
  appliedPatch?: string;
  appliedFiles?: string[];
  appliedFileIds?: string[];
  appliedHunkIds?: string[];
  appliedFileStates?: Record<string, string>;
  appliedAt?: string;
  undoneAt?: string;
  conflict?: LivePatchConflictReport;
  supersedesProposalId?: string;
  supersededByProposalId?: string;
}

export interface LivePatchHunkReview {
  id: string;
  header: string;
  patch: string;
}

export interface LivePatchFileReview {
  id: string;
  path: string;
  patch: string;
  hunkSelectable: boolean;
  hunks: LivePatchHunkReview[];
}

export interface LivePatchProposalReview extends LivePatchProposal {
  patchFiles: LivePatchFileReview[];
}

export interface LivePatchSelection {
  fileIds?: string[];
  hunkIds?: string[];
}

export interface LivePatchConflictUnit {
  id: string;
  header?: string;
  status: "clean" | "conflict";
  message?: string;
}

export interface LivePatchConflictFile {
  id: string;
  path: string;
  status: "clean" | "partial" | "conflict";
  message?: string;
  currentDiff?: string;
  hunks: LivePatchConflictUnit[];
}

export interface LivePatchConflictReport {
  detectedAt: string;
  message: string;
  selectedFileIds: string[];
  selectedHunkIds: string[];
  files: LivePatchConflictFile[];
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
  options?: { cwd?: string; timeout?: number; runtimeEnv?: ToolRunContext["runtimeEnv"]; signal?: AbortSignal },
): Promise<string> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options?.cwd ?? cwd(),
      timeout: options?.timeout ?? 120_000,
      maxBuffer: 20 * 1024 * 1024,
      signal: options?.signal,
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
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf-8");
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function withStoreLock<T>(file: string, operation: () => Promise<T>): Promise<T> {
  const previous = storeQueues.get(file) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  storeQueues.set(file, queued);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (storeQueues.get(file) === queued) storeQueues.delete(file);
  }
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
    const out = await run("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, timeout: 60_000 });
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

type RelatedTestMatch = {
  file: string;
  score: number;
  reasons: string[];
};

type RelatedTestDiscovery = {
  relatedTests: RelatedTestMatch[];
  strategy: "heuristic" | "jest-dependency-graph";
  warning?: string;
};

type TestRunnerKind = "vitest" | "jest" | "bun" | "node" | "playwright" | "pytest" | "go" | "cargo" | "custom";

type TestRunner = {
  kind: TestRunnerKind;
  command: string;
  baseArgs: string[];
  script?: string;
};

function isTestFile(file: string): boolean {
  return /(?:^|\/)(?:__tests__\/.*|tests\/.*\.rs|.*(?:\.|_)(?:test|spec)\.[cm]?[jt]sx?|.*\.e2e-spec\.[cm]?[jt]s|test_.*\.py|.*_test\.(?:py|go|rs))$/i.test(file);
}

function languageFamily(file: string): "python" | "go" | "rust" | "javascript" {
  const extension = extname(file).toLowerCase();
  return extension === ".py" ? "python" : extension === ".go" ? "go" : extension === ".rs" ? "rust" : "javascript";
}

function sourceStem(file: string): string {
  const stem = file.replace(/\.[^.\/]+$/, "").replace(/(?:\.|_)(?:test|spec)$/, "").replace(/\.e2e-spec$/, "");
  const name = basename(stem).replace(/^test_/, "");
  return join(dirname(stem), name);
}

function importedSpecifiers(text: string, file: string): string[] {
  const specifiers = new Set<string>();
  const extension = extname(file).toLowerCase();
  if (extension === ".py") {
    const pattern = /^\s*(?:from|import)\s+([\w.]+)/gm;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) specifiers.add(match[1].replace(/\./g, "/"));
  } else if (extension === ".rs") {
    const pattern = /\b(?:use\s+(?:crate::|super::|self::)?|mod\s+)([A-Za-z_][\w:]*)/g;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) specifiers.add(match[1].replace(/::/g, "/"));
  } else {
    const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function importMatchesSource(root: string, testFile: string, specifier: string, sourceFile: string): boolean {
  if (!specifier.startsWith(".")) return basename(sourceStem(specifier)) === basename(sourceStem(sourceFile));
  const imported = resolve(root, dirname(testFile), sourceStem(specifier));
  const source = resolve(root, sourceStem(sourceFile));
  return imported === source || (basename(source) === "index" && imported === dirname(source));
}

async function findRelatedTests(root: string, sourceFiles: string[], limit = 100): Promise<RelatedTestMatch[]> {
  const candidates = (await listFiles(root, 5000)).filter(isTestFile);
  const matches: RelatedTestMatch[] = [];
  for (const candidate of candidates) {
    const compatibleSources = sourceFiles.filter((source) => languageFamily(source) === languageFamily(candidate));
    if (compatibleSources.length === 0) continue;
    const sourceSet = new Set(compatibleSources);
    const sourceStems = compatibleSources.map(sourceStem);
    const absolute = resolve(root, candidate);
    if (!isPathInside(root, absolute)) continue;
    const stats = await fs.lstat(absolute).catch(() => undefined);
    if (!stats?.isFile() || stats.isSymbolicLink()) continue;
    const reasons = new Set<string>();
    let score = 0;
    if (sourceSet.has(candidate)) {
      score = 100;
      reasons.add("requested test file");
    }
    const candidateStem = sourceStem(candidate);
    for (const stem of sourceStems) {
      if (candidateStem === stem) {
        score = Math.max(score, 85);
        reasons.add("matching path and basename");
      } else if (basename(candidateStem) === basename(stem)) {
        score = Math.max(score, 70);
        reasons.add("matching basename");
      }
    }
    if (score < 100) {
      const text = await fs.readFile(absolute, "utf-8").catch(() => "");
      for (const specifier of importedSpecifiers(text, candidate)) {
        if (compatibleSources.some((source) => importMatchesSource(root, candidate, specifier, source))) {
          score = Math.max(score, 95);
          reasons.add(`imports ${specifier}`);
        }
      }
    }
    if (score > 0) matches.push({ file: candidate, score, reasons: [...reasons] });
  }
  return matches.sort((left, right) => right.score - left.score || left.file.localeCompare(right.file)).slice(0, limit);
}

function parseJsonArray(output: string): unknown[] {
  const trimmed = output.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Some runners print a notice before their JSON result. Try the final array below.
  }
  const end = trimmed.lastIndexOf("]");
  for (let start = trimmed.lastIndexOf("[", end); start >= 0 && end > start; start = trimmed.lastIndexOf("[", start - 1)) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Keep scanning backward to the beginning of the final valid array.
    }
  }
  throw new Error("Test runner did not return a JSON array");
}

async function findRelatedTestsWithJest(
  root: string,
  sourceFiles: string[],
  limit: number,
  runtimeEnv?: ToolRunContext["runtimeEnv"],
  signal?: AbortSignal,
): Promise<RelatedTestMatch[]> {
  const executable = localExecutable(root, "jest");
  if (!executable) throw new Error("No repository-local Jest executable was found");
  const result = await execFileAsync(executable, [
    "--listTests",
    "--json",
    "--findRelatedTests",
    ...sourceFiles.map((file) => resolve(root, file)),
  ], {
    cwd: root,
    timeout: 120_000,
    maxBuffer: 20 * 1024 * 1024,
    signal,
    env: {
      ...process.env,
      ...runtimeEnv,
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
    },
  });
  const listed = parseJsonArray(String(result.stdout ?? ""));
  const matches: RelatedTestMatch[] = [];
  const seen = new Set<string>();
  const canonicalRoot = await fs.realpath(root);
  for (const value of listed) {
    if (typeof value !== "string") continue;
    const absolute = resolve(root, value);
    const canonical = await fs.realpath(absolute).catch(() => undefined);
    if (!canonical || !isPathInside(canonicalRoot, canonical)) continue;
    const file = relative(canonicalRoot, canonical).split(sep).join("/");
    if (seen.has(file) || !isTestFile(file)) continue;
    const stats = await fs.lstat(absolute).catch(() => undefined);
    if (!stats?.isFile() || stats.isSymbolicLink()) continue;
    seen.add(file);
    matches.push({ file, score: 100, reasons: ["Jest dependency graph"] });
    if (matches.length >= limit) break;
  }
  return matches;
}

async function discoverRelatedTests(
  root: string,
  sourceFiles: string[],
  limit: number,
  runner?: TestRunner,
  runtimeEnv?: ToolRunContext["runtimeEnv"],
  signal?: AbortSignal,
): Promise<RelatedTestDiscovery> {
  if (runner?.kind === "jest") {
    try {
      return {
        relatedTests: await findRelatedTestsWithJest(root, sourceFiles, limit, runtimeEnv, signal),
        strategy: "jest-dependency-graph",
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = redactRuntimeSecrets(error instanceof Error ? error.message : String(error), runtimeEnv);
      return {
        relatedTests: await findRelatedTests(root, sourceFiles, limit),
        strategy: "heuristic",
        warning: `Jest dependency-graph discovery was unavailable; used heuristic matching: ${message}`,
      };
    }
  }
  return { relatedTests: await findRelatedTests(root, sourceFiles, limit), strategy: "heuristic" };
}

function inferTestRunnerKind(command: string): TestRunnerKind {
  if (/\bvitest\b/i.test(command)) return "vitest";
  if (/\bjest\b/i.test(command)) return "jest";
  if (/\bplaywright\b/i.test(command)) return "playwright";
  if (/\bbun\s+test\b/i.test(command)) return "bun";
  if (/\bnode\s+--test\b/i.test(command)) return "node";
  if (/\bpytest\b/i.test(command)) return "pytest";
  if (/\bgo\s+test\b/i.test(command)) return "go";
  if (/\bcargo\s+test\b/i.test(command)) return "cargo";
  return "custom";
}

async function resolveTestRunner(root: string, requestedScript = "", files: string[] = []): Promise<TestRunner> {
  const pkg = await readPackage(root);
  const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
  const packageManager = detectPackageManager(root);
  const script = requestedScript;
  if (script) {
    if (!scripts[script]) throw new Error(`Unknown package script: ${script}`);
    const command = runCommandForPackageManager(packageManager);
    const baseArgs = runArgsForScript(packageManager, script, []);
    if (command === "npm") baseArgs.push("--");
    return {
      kind: inferTestRunnerKind(scripts[script]),
      command,
      baseArgs,
      script,
    };
  }
  const extensions = new Set(files.map((file) => extname(file).toLowerCase()));
  const languageFamilies = new Set(files.map(languageFamily));
  const inferFromProject = files.length === 0 && !scripts.test;
  if (languageFamilies.size > 1) throw new Error("Related tests span multiple language runners; run each language family separately");
  if (inferFromProject) {
    const detectedFamilies = [
      existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "pytest.ini")) ? "python" : "",
      existsSync(join(root, "go.mod")) ? "go" : "",
      existsSync(join(root, "Cargo.toml")) ? "rust" : "",
    ].filter(Boolean);
    if (detectedFamilies.length > 1) throw new Error("Multiple language test runners were detected; provide explicit test files or a package script");
  }
  if (extensions.has(".py") || (inferFromProject && (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "pytest.ini"))))) {
    const pytest = localPythonExecutable(root, "pytest");
    if (!pytest) throw new Error("No repository-local pytest executable was found (expected .venv/bin/pytest or venv/bin/pytest)");
    return { kind: "pytest", command: pytest, baseArgs: [] };
  }
  if (extensions.has(".go") || (inferFromProject && existsSync(join(root, "go.mod")))) {
    return { kind: "go", command: "go", baseArgs: ["test"] };
  }
  if (extensions.has(".rs") || (inferFromProject && existsSync(join(root, "Cargo.toml")))) {
    return { kind: "cargo", command: "cargo", baseArgs: ["test"] };
  }
  if (scripts.test) {
    const command = runCommandForPackageManager(packageManager);
    const baseArgs = runArgsForScript(packageManager, "test", []);
    if (command === "npm") baseArgs.push("--");
    return { kind: inferTestRunnerKind(scripts.test), command, baseArgs, script: "test" };
  }
  const vitest = localExecutable(root, "vitest");
  if (vitest) return { kind: "vitest", command: vitest, baseArgs: ["run"] };
  const jest = localExecutable(root, "jest");
  if (jest) return { kind: "jest", command: jest, baseArgs: [] };
  const playwright = localExecutable(root, "playwright");
  if (playwright) return { kind: "playwright", command: playwright, baseArgs: ["test"] };
  if (packageManager === "bun") return { kind: "bun", command: "bun", baseArgs: ["test"] };
  return { kind: "node", command: process.execPath, baseArgs: ["--test"] };
}

function testRunnerArgs(runner: TestRunner, files: string[], name?: string): string[] {
  const args = [...runner.baseArgs];
  if (runner.kind === "node") {
    if (name) args.push(`--test-name-pattern=${name}`);
    args.push(...files);
    return args;
  }
  if (runner.kind === "go") {
    const packages = [...new Set(files.map((file) => {
      const directory = dirname(file).split(sep).join("/");
      return directory === "." ? "." : `./${directory}`;
    }))];
    args.push(...(packages.length > 0 ? packages : ["./..."]));
  } else if (runner.kind === "cargo") {
    for (const file of files.filter((candidate) => /^tests\/[^/]+\.rs$/i.test(candidate))) {
      args.push("--test", basename(file, ".rs"));
    }
  } else {
    args.push(...files);
  }
  if (!name) return args;
  if (runner.kind === "vitest" || runner.kind === "jest") args.push("-t", name);
  else if (runner.kind === "bun") args.push("--test-name-pattern", name);
  else if (runner.kind === "playwright") args.push("--grep", name);
  else if (runner.kind === "pytest") args.push("-k", name);
  else if (runner.kind === "go") args.push("-run", name);
  else if (runner.kind === "cargo") args.push(name);
  else throw new Error("The selected custom test script does not expose a known test-name filter");
  return args;
}

async function executeTests(
  root: string,
  runner: TestRunner,
  files: string[],
  name: string | undefined,
  timeoutMs: number,
  ctx: ToolRunContext,
): Promise<{ status: "passed" | "failed" | "cancelled"; command: string[]; output: string }> {
  const args = testRunnerArgs(runner, files, name);
  const command = [runner.command, ...args];
  try {
    const output = await run(runner.command, args, {
      cwd: root,
      timeout: Math.min(Math.max(timeoutMs || 300_000, 1000), 900_000),
      runtimeEnv: ctx.runtimeEnv,
      signal: ctx.signal,
    });
    return { status: "passed", command, output };
  } catch (error) {
    return {
      status: ctx.signal.aborted ? "cancelled" : "failed",
      command,
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractPatchFiles(patch: string): string[] {
  const files = new Set<string>();
  for (const line of patch.split(/\r?\n/)) {
    const diffMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (diffMatch) {
      files.add(diffMatch[1]);
      files.add(diffMatch[2]);
      continue;
    }
    const match = /^(?:\+\+\+|---)\s+(?:[ab]\/(.+)|(.+))$/.exec(line);
    if (!match) continue;
    const file = (match[1] || match[2] || "").trim();
    if (!file || file === "/dev/null") continue;
    files.add(file);
  }
  return Array.from(files).filter((file) => !isAbsolute(file) && !file.split(/[\\/]/).includes(".."));
}

function patchHeaderPath(section: string, marker: "---" | "+++"): string | undefined {
  const line = section.split(/\r?\n/).find((candidate) => candidate.startsWith(`${marker} `));
  if (!line) return undefined;
  const raw = line.slice(4).split("\t", 1)[0].trim();
  if (!raw || raw === "/dev/null") return undefined;
  return raw.replace(/^[ab]\//, "");
}

function parsePatchFiles(patch: string): LivePatchFileReview[] {
  const starts = [...patch.matchAll(/^diff --git /gm)].map((match) => match.index ?? 0);
  const sections = starts.length === 0
    ? [patch]
    : starts.map((start, index) => patch.slice(index === 0 ? 0 : start, starts[index + 1] ?? patch.length));
  return sections.filter((section) => section.trim()).map((section, fileIndex) => {
    const oldPath = patchHeaderPath(section, "---");
    const newPath = patchHeaderPath(section, "+++");
    const paths = extractPatchFiles(section);
    const path = newPath ?? oldPath ?? paths.at(-1) ?? `patch section ${fileIndex + 1}`;
    const hunkStarts = [...section.matchAll(/^@@ .*@@.*$/gm)].map((match) => match.index ?? 0);
    const hunks = hunkStarts.map((start, hunkIndex) => {
      const hunkPatch = section.slice(start, hunkStarts[hunkIndex + 1] ?? section.length);
      return {
        id: `file-${fileIndex}-hunk-${hunkIndex}`,
        header: hunkPatch.split(/\r?\n/, 1)[0],
        patch: hunkPatch,
      };
    });
    const hunkSelectable = Boolean(
      oldPath
      && newPath
      && hunks.length > 0
      && !/^(?:(?:rename|copy) (?:from|to)|(?:old|new) mode|(?:dis)?similarity index) /m.test(section)
      && !/(?:GIT binary patch|Binary files .* differ)/.test(section),
    );
    return { id: `file-${fileIndex}`, path, patch: section, hunkSelectable, hunks };
  });
}

function proposalForReview(proposal: LivePatchProposal): LivePatchProposalReview {
  return {
    ...proposal,
    files: [...proposal.files],
    validationPlan: [...proposal.validationPlan],
    ...(proposal.appliedFiles ? { appliedFiles: [...proposal.appliedFiles] } : {}),
    ...(proposal.appliedFileIds ? { appliedFileIds: [...proposal.appliedFileIds] } : {}),
    ...(proposal.appliedHunkIds ? { appliedHunkIds: [...proposal.appliedHunkIds] } : {}),
    ...(proposal.appliedFileStates ? { appliedFileStates: { ...proposal.appliedFileStates } } : {}),
    ...(proposal.conflict ? {
      conflict: {
        ...proposal.conflict,
        selectedFileIds: [...proposal.conflict.selectedFileIds],
        selectedHunkIds: [...proposal.conflict.selectedHunkIds],
        files: proposal.conflict.files.map((file) => ({ ...file, hunks: file.hunks.map((hunk) => ({ ...hunk })) })),
      },
    } : {}),
    patchFiles: parsePatchFiles(proposal.patch),
  };
}

function selectProposalPatch(proposal: LivePatchProposal, selection?: LivePatchSelection): {
  patch: string;
  files: string[];
  fileIds: string[];
  hunkIds: string[];
  complete: boolean;
} {
  const reviewFiles = parsePatchFiles(proposal.patch);
  if (!selection) {
    return {
      patch: proposal.patch,
      files: [...proposal.files],
      fileIds: reviewFiles.map((file) => file.id),
      hunkIds: [],
      complete: true,
    };
  }
  const fileIds = [...new Set(asStringArray(selection.fileIds))];
  const hunkIds = [...new Set(asStringArray(selection.hunkIds))];
  if (fileIds.length === 0 && hunkIds.length === 0) throw new Error("Select at least one file or hunk to apply");
  const knownFiles = new Map(reviewFiles.map((file) => [file.id, file]));
  const knownHunks = new Map(reviewFiles.flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const)));
  const unknownFiles = fileIds.filter((id) => !knownFiles.has(id));
  const unknownHunks = hunkIds.filter((id) => !knownHunks.has(id));
  if (unknownFiles.length > 0 || unknownHunks.length > 0) throw new Error("Selection contains unknown file or hunk IDs");
  for (const hunkId of hunkIds) {
    const owner = knownHunks.get(hunkId)!.file;
    if (!owner.hunkSelectable) throw new Error(`Hunks cannot be selected independently for ${owner.path}`);
    if (fileIds.includes(owner.id)) throw new Error(`Select either the whole file or individual hunks for ${owner.path}, not both`);
  }

  let selectedPatch = "";
  for (const file of reviewFiles) {
    if (fileIds.includes(file.id)) {
      selectedPatch += file.patch;
      continue;
    }
    const selectedHunks = file.hunks.filter((hunk) => hunkIds.includes(hunk.id));
    if (selectedHunks.length === 0) continue;
    if (selectedHunks.length === file.hunks.length) {
      selectedPatch += file.patch;
      continue;
    }
    const firstHunkStart = file.patch.indexOf(file.hunks[0].patch);
    selectedPatch += `${file.patch.slice(0, firstHunkStart)}${selectedHunks.map((hunk) => hunk.patch).join("")}`;
  }
  const files = extractPatchFiles(selectedPatch);
  if (!selectedPatch.trim() || files.length === 0) throw new Error("The selected patch does not contain an applicable file change");
  return { patch: selectedPatch, files, fileIds, hunkIds, complete: selectedPatch === proposal.patch };
}

async function captureFileStates(repoRoot: string, files: string[]): Promise<Record<string, string>> {
  const states: Record<string, string> = {};
  for (const file of [...new Set(files)].sort()) {
    const target = resolve(repoRoot, file);
    if (!isPathInside(repoRoot, target)) throw new Error(`Patch file escapes repository: ${file}`);
    const stats = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (!stats) {
      states[file] = "missing";
      continue;
    }
    const payload = stats.isSymbolicLink()
      ? Buffer.from(`symlink:${await fs.readlink(target)}`)
      : stats.isFile()
        ? await fs.readFile(target)
        : Buffer.from(`other:${stats.mode}`);
    states[file] = `${stats.mode & 0o7777}:${createHash("sha256").update(payload).digest("hex")}`;
  }
  return states;
}

function isPathInside(parent: string, candidate: string): boolean {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

async function resolveRepoFile(root: string, file: string): Promise<{ absolute: string; relative: string }> {
  if (!file.trim() || isAbsolute(file)) {
    throw new Error("file must be a repository-relative path");
  }
  const absolute = resolve(root, file);
  if (!isPathInside(root, absolute)) throw new Error("file must stay inside the repository");

  const stats = await fs.lstat(absolute);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("file must be a regular file inside the repository");
  const [realRoot, realParent] = await Promise.all([fs.realpath(root), fs.realpath(dirname(absolute))]);
  if (!isPathInside(realRoot, realParent)) throw new Error("file resolves outside the repository");
  return { absolute, relative: relative(root, absolute).split(sep).join("/") };
}

async function resolveRepoFiles(root: string, value: unknown, limit = 200): Promise<Array<{ absolute: string; relative: string }>> {
  const requested = [...new Set(asStringArray(value).map((file) => file.trim()).filter(Boolean))];
  if (requested.length === 0) throw new Error("files must contain at least one repository-relative path");
  if (requested.length > limit) throw new Error(`files cannot contain more than ${limit} paths`);
  return Promise.all(requested.map((file) => resolveRepoFile(root, file)));
}

function localExecutable(root: string, name: string): string | undefined {
  const executable = process.platform === "win32" ? `${name}.cmd` : name;
  const candidate = join(root, "node_modules", ".bin", executable);
  return existsSync(candidate) ? candidate : undefined;
}

function localPythonExecutable(root: string, name: string): string | undefined {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  for (const environment of [".venv", "venv"]) {
    const candidate = join(root, environment, process.platform === "win32" ? "Scripts" : "bin", executable);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function recordTouched(repoRoot: string, files: string[], source: string, options?: { proposalId?: string; agentId?: string; conversationId?: string }): Promise<void> {
  await withStoreLock(AGENT_TOUCHED_FILE, async () => {
    const store = await readJson<AgentTouchedStore>(AGENT_TOUCHED_FILE, { entries: [] });
    const now = new Date().toISOString();
    for (const file of files) {
      store.entries.push({ repoRoot, file, source, proposalId: options?.proposalId, touchedAt: now, agentId: options?.agentId, conversationId: options?.conversationId });
    }
    store.entries = store.entries.slice(-2000);
    await writeJson(AGENT_TOUCHED_FILE, store);
  });
}

async function tryRecordTouched(repoRoot: string, files: string[], source: string, options?: { proposalId?: string; agentId?: string; conversationId?: string }): Promise<string | undefined> {
  try {
    await recordTouched(repoRoot, files, source, options);
    return undefined;
  } catch (error) {
    return `The file operation succeeded, but touched-file tracking failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function noteToolTouchedFiles(startPath: string, files: string[], source: string, options?: { agentId?: string; conversationId?: string }): Promise<void> {
  const repoRoot = await gitRoot(startPath || cwd());
  const realRepoRoot = await fs.realpath(repoRoot).catch(() => resolve(repoRoot));
  const normalized: string[] = [];
  for (const file of files.filter(Boolean)) {
    if (!isAbsolute(file)) {
      const candidate = resolve(realRepoRoot, file);
      if (isPathInside(realRepoRoot, candidate)) normalized.push(relative(realRepoRoot, candidate).split(sep).join("/"));
      continue;
    }
    let candidate: string;
    try {
      candidate = await fs.realpath(file);
    } catch {
      const realParent = await fs.realpath(dirname(file)).catch(() => resolve(dirname(file)));
      candidate = join(realParent, basename(file));
    }
    if (isPathInside(realRepoRoot, candidate)) normalized.push(relative(realRepoRoot, candidate).split(sep).join("/"));
  }
  if (normalized.length === 0) return;
  await recordTouched(repoRoot, Array.from(new Set(normalized)), source, options);
}

async function applyPatchFileUnlocked(repoRoot: string, patch: string, reverse = false): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), "cowork-patch-"));
  const patchPath = join(dir, "proposal.patch");
  await fs.writeFile(patchPath, patch, "utf-8");
  const direction = reverse ? ["--reverse"] : [];
  try {
    try {
      await run("git", ["apply", ...direction, "--check", patchPath], { cwd: repoRoot, timeout: 60_000 });
    } catch (error) {
      const action = reverse ? "undo" : "apply";
      throw new Error(`Patch cannot ${action} cleanly because the repository no longer matches the reviewed diff. ${error instanceof Error ? error.message : String(error)}`);
    }
    return await run("git", ["apply", ...direction, patchPath], { cwd: repoRoot, timeout: 60_000 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function applyPatchFile(repoRoot: string, patch: string, reverse = false): Promise<string> {
  return withStoreLock(`repo:${repoRoot}`, () => applyPatchFileUnlocked(repoRoot, patch, reverse));
}

async function checkPatchUnlocked(repoRoot: string, patch: string): Promise<{ clean: boolean; message?: string }> {
  const dir = await fs.mkdtemp(join(tmpdir(), "cowork-patch-check-"));
  const patchPath = join(dir, "proposal.patch");
  try {
    await fs.writeFile(patchPath, patch, "utf-8");
    await run("git", ["apply", "--check", "--verbose", patchPath], { cwd: repoRoot, timeout: 60_000 });
    return { clean: true };
  } catch (error) {
    return { clean: false, message: truncate(error instanceof Error ? error.message : String(error), 4000) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function patchForHunk(file: LivePatchFileReview, hunk: LivePatchHunkReview): string {
  const firstHunk = file.hunks[0];
  if (!firstHunk) return file.patch;
  const firstHunkStart = file.patch.indexOf(firstHunk.patch);
  return `${file.patch.slice(0, firstHunkStart)}${hunk.patch}`;
}

async function analyzePatchConflictUnlocked(
  repoRoot: string,
  proposal: LivePatchProposal,
  selected: ReturnType<typeof selectProposalPatch>,
  applyError: unknown,
): Promise<LivePatchConflictReport> {
  const originalFiles = parsePatchFiles(proposal.patch);
  const patchFiles = parsePatchFiles(selected.patch).slice(0, 50);
  const files: LivePatchConflictFile[] = [];
  for (const file of patchFiles) {
    const originalFile = originalFiles.find((candidate) => candidate.path === file.path);
    const fileCheck = await checkPatchUnlocked(repoRoot, file.patch);
    const hunks: LivePatchConflictUnit[] = [];
    if (file.hunkSelectable) {
      for (const hunk of file.hunks.slice(0, 50)) {
        const check = await checkPatchUnlocked(repoRoot, patchForHunk(file, hunk));
        const originalHunk = originalFile?.hunks.find((candidate) => candidate.patch === hunk.patch || candidate.header === hunk.header);
        hunks.push({
          id: originalHunk?.id ?? hunk.id,
          header: hunk.header,
          status: check.clean ? "clean" : "conflict",
          ...(check.message ? { message: check.message } : {}),
        });
      }
    }
    const conflictedHunks = hunks.filter((hunk) => hunk.status === "conflict").length;
    const currentDiff = await run("git", ["diff", "--no-ext-diff", "--", file.path], { cwd: repoRoot, timeout: 30_000 })
      .catch(() => "");
    const currentStatus = currentDiff.trim()
      ? currentDiff
      : await run("git", ["status", "--short", "--untracked-files=all", "--", file.path], { cwd: repoRoot, timeout: 30_000 }).catch(() => "");
    files.push({
      id: originalFile?.id ?? file.id,
      path: file.path,
      status: fileCheck.clean ? "clean" : hunks.some((hunk) => hunk.status === "clean") ? "partial" : "conflict",
      ...(fileCheck.message ? { message: fileCheck.message } : {}),
      ...(currentStatus.trim() ? { currentDiff: truncate(currentStatus, 12_000) } : {}),
      hunks,
    });
    if (conflictedHunks === 0 && !fileCheck.clean && hunks.length === 0) {
      files[files.length - 1].status = "conflict";
    }
  }
  return {
    detectedAt: new Date().toISOString(),
    message: truncate(applyError instanceof Error ? applyError.message : String(applyError), 8000),
    selectedFileIds: [...selected.fileIds],
    selectedHunkIds: [...selected.hunkIds],
    files,
  };
}

function requireProposalId(proposalId: unknown): string {
  if (typeof proposalId !== "string" || !/^patch-\d+(?:-[0-9a-f-]{36})?$/i.test(proposalId)) {
    throw new Error("invalid proposal id");
  }
  return proposalId;
}

/** Return a stored proposal for renderer review without allowing arbitrary file access. */
export async function getLivePatchProposal(proposalId: string): Promise<LivePatchProposalReview> {
  const id = requireProposalId(proposalId);
  const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
  const proposal = proposals.find((item) => item.id === id);
  if (!proposal) throw new Error("proposal not found");
  return proposalForReview(proposal);
}

/** Apply a verified stored proposal using the same git-apply safety path as the client tool. */
export async function applyLivePatchProposal(
  proposalId: string,
  actor: { agentId?: string; conversationId?: string } = {},
  selection?: LivePatchSelection,
): Promise<{ proposal: LivePatchProposalReview; output: string; trackingWarning?: string }> {
  const id = requireProposalId(proposalId);
  const result = await withStoreLock(LIVE_PATCH_FILE, async () => {
    const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error("proposal not found");
    if (proposal.status !== "pending") throw new Error(`proposal is ${proposal.status}, not pending`);

    const selected = selectProposalPatch(proposal, selection);
    const applied = await withStoreLock(`repo:${proposal.repoRoot}`, async () => {
      let output: string;
      try {
        output = await applyPatchFileUnlocked(proposal.repoRoot, selected.patch);
      } catch (error) {
        proposal.conflict = await analyzePatchConflictUnlocked(proposal.repoRoot, proposal, selected, error);
        proposal.updatedAt = proposal.conflict.detectedAt;
        await writeJson(LIVE_PATCH_FILE, proposals).catch((storeError) => {
          throw new Error(`${error instanceof Error ? error.message : String(error)} Conflict analysis was generated but could not be stored: ${storeError instanceof Error ? storeError.message : String(storeError)}`);
        });
        throw error;
      }
      try {
        const fileStates = await captureFileStates(proposal.repoRoot, selected.files);
        const now = new Date().toISOString();
        proposal.status = selected.complete ? "applied" : "partially_applied";
        proposal.appliedPatch = selected.patch;
        proposal.appliedFiles = selected.files;
        proposal.appliedFileIds = selected.fileIds;
        proposal.appliedHunkIds = selected.hunkIds;
        proposal.appliedFileStates = fileStates;
        proposal.appliedAt = now;
        delete proposal.conflict;
        proposal.updatedAt = now;
        await writeJson(LIVE_PATCH_FILE, proposals);
        return { output };
      } catch (error) {
        try {
          await applyPatchFileUnlocked(proposal.repoRoot, selected.patch, true);
        } catch (rollbackError) {
          throw new Error(`Patch was applied, but safety bookkeeping failed and automatic rollback also failed. Inspect the repository before continuing. Bookkeeping: ${error instanceof Error ? error.message : String(error)}. Rollback: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
        throw new Error(`Patch application was rolled back because safety bookkeeping failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return { proposal: proposalForReview(proposal), output: applied.output };
  });

  const trackingWarning = await tryRecordTouched(result.proposal.repoRoot, result.proposal.appliedFiles ?? result.proposal.files, "LiveApplyPatch", {
    proposalId: result.proposal.id,
    agentId: actor.agentId ?? result.proposal.agentId,
    conversationId: actor.conversationId ?? result.proposal.conversationId,
  });
  return { ...result, ...(trackingWarning ? { trackingWarning } : {}) };
}

/** Reject a pending proposal without modifying repository files. */
export async function rejectLivePatchProposal(
  proposalId: string,
  reason = "Rejected by user",
): Promise<LivePatchProposalReview> {
  const id = requireProposalId(proposalId);
  return withStoreLock(LIVE_PATCH_FILE, async () => {
    const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error("proposal not found");
    if (proposal.status !== "pending") throw new Error(`proposal is ${proposal.status}, not pending`);

    proposal.status = "rejected";
    proposal.rejectionReason = reason.trim() || "Rejected by user";
    proposal.updatedAt = new Date().toISOString();
    await writeJson(LIVE_PATCH_FILE, proposals);
    return proposalForReview(proposal);
  });
}

/** Undo the exact applied selection only when none of its files changed after application. */
export async function undoLivePatchProposal(
  proposalId: string,
  actor: { agentId?: string; conversationId?: string } = {},
): Promise<{ proposal: LivePatchProposalReview; output: string; trackingWarning?: string }> {
  const id = requireProposalId(proposalId);
  const result = await withStoreLock(LIVE_PATCH_FILE, async () => {
    const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
    const proposal = proposals.find((item) => item.id === id);
    if (!proposal) throw new Error("proposal not found");
    if (proposal.status !== "applied" && proposal.status !== "partially_applied") {
      throw new Error(`proposal is ${proposal.status}, not applied`);
    }
    if (!proposal.appliedPatch || !proposal.appliedFiles || !proposal.appliedFileStates) {
      throw new Error("This legacy proposal has no verified undo snapshot and cannot be undone safely");
    }

    const output = await withStoreLock(`repo:${proposal.repoRoot}`, async () => {
      const current = await captureFileStates(proposal.repoRoot, proposal.appliedFiles!);
      const changed = proposal.appliedFiles!.filter((file) => current[file] !== proposal.appliedFileStates![file]);
      if (changed.length > 0) {
        throw new Error(`Cannot undo because these files changed after the patch was applied: ${changed.join(", ")}`);
      }
      const previousStatus = proposal.status;
      const previousUpdatedAt = proposal.updatedAt;
      const reverseOutput = await applyPatchFileUnlocked(proposal.repoRoot, proposal.appliedPatch!, true);
      try {
        const now = new Date().toISOString();
        proposal.status = "undone";
        proposal.undoneAt = now;
        proposal.updatedAt = now;
        await writeJson(LIVE_PATCH_FILE, proposals);
        return reverseOutput;
      } catch (error) {
        proposal.status = previousStatus;
        proposal.updatedAt = previousUpdatedAt;
        delete proposal.undoneAt;
        try {
          await applyPatchFileUnlocked(proposal.repoRoot, proposal.appliedPatch!);
        } catch (rollbackError) {
          throw new Error(`The patch was undone, but status storage failed and automatic re-application also failed. Inspect the repository before continuing. Storage: ${error instanceof Error ? error.message : String(error)}. Re-apply: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
        throw new Error(`Undo was rolled back because proposal status could not be stored: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    return { proposal: proposalForReview(proposal), output };
  });

  const trackingWarning = await tryRecordTouched(result.proposal.repoRoot, result.proposal.appliedFiles ?? [], "LiveUndoPatch", {
    proposalId: result.proposal.id,
    agentId: actor.agentId ?? result.proposal.agentId,
    conversationId: actor.conversationId ?? result.proposal.conversationId,
  });
  return { ...result, ...(trackingWarning ? { trackingWarning } : {}) };
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
  description: "Find semantic TypeScript/JavaScript references to a symbol. Falls back to code search when no language-service result is available.",
  parameters: { type: "object", properties: { symbol: { type: "string" }, path: { type: "string" }, limit: { type: "number" } }, required: ["symbol"], additionalProperties: false },
  run: async (args) => {
    const symbol = asString(args.symbol);
    if (!symbol.trim()) return fail("symbol is required");
    const searchPath = resolve(asString(args.path, cwd()));
    const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 500);
    try {
      const { lspManager } = await import("../lsp/manager.js");
      const locations = await lspManager.findReferences(symbol, searchPath, limit);
      if (locations.length > 0) return ok(JSON.stringify({ engine: "typescript-language-service", symbol, locations }, null, 2));
    } catch {
      // Preserve the existing search behavior for unsupported or malformed projects.
    }
    return codeSearchTool.run({ query: symbol, path: searchPath, mode: "symbol", limit }, { signal: new AbortController().signal });
  },
};

const codeGetDefinitionTool: ClientToolDefinition = {
  name: "CodeGetDefinition",
  description: "Find semantic TypeScript/JavaScript definitions for a symbol. Falls back to declaration-pattern search when needed.",
  parameters: { type: "object", properties: { symbol: { type: "string" }, path: { type: "string" }, limit: { type: "number" } }, required: ["symbol"], additionalProperties: false },
  run: async (args) => {
    const symbol = asString(args.symbol);
    if (!symbol.trim()) return fail("symbol is required");
    const searchPath = resolve(asString(args.path, cwd()));
    const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 500);
    try {
      const { lspManager } = await import("../lsp/manager.js");
      const locations = await lspManager.findDefinitions(symbol, searchPath, limit);
      if (locations.length > 0) return ok(JSON.stringify({ engine: "typescript-language-service", symbol, locations }, null, 2));
    } catch {
      // Preserve the declaration-pattern fallback for unsupported projects.
    }
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `(export\\s+)?(async\\s+)?(function|class|interface|type|const|let|var)\\s+${escaped}\\b`;
    return codeSearchTool.run({ query: pattern, path: searchPath, mode: "text", limit, glob: "**/*.{ts,tsx,js,jsx}" }, { signal: new AbortController().signal });
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

const codeEditTool: ClientToolDefinition = {
  name: "CodeEdit",
  description: "Make one precise text replacement in an existing repository file and record that file as agent-touched. Fails on ambiguous matches unless replaceAll or expectedReplacements is explicit.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      file: { type: "string", description: "Repository-relative file path." },
      oldString: { type: "string", description: "Exact text to replace." },
      newString: { type: "string", description: "Replacement text." },
      replaceAll: { type: "boolean", description: "Replace every exact match. Default false." },
      expectedReplacements: { type: "number", description: "Require exactly this many matches before writing." },
    },
    required: ["file", "oldString", "newString"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const target = await resolveRepoFile(root, asString(args.file));
      const oldString = asString(args.oldString).replace(/\r\n/g, "\n");
      const newString = asString(args.newString).replace(/\r\n/g, "\n");
      if (!oldString) return fail("oldString cannot be empty");
      if (oldString === newString) return fail("oldString and newString must be different");
      const replaceAll = args.replaceAll === true;
      const expected = args.expectedReplacements === undefined ? undefined : Number(args.expectedReplacements);
      if (expected !== undefined && (!Number.isInteger(expected) || expected < 1)) {
        return fail("expectedReplacements must be a positive integer");
      }

      const result = await withStoreLock(`repo:${root}`, () => withStoreLock(target.absolute, async () => {
        const raw = await fs.readFile(target.absolute, "utf-8");
        const usesCrLf = raw.includes("\r\n");
        const content = raw.replace(/\r\n/g, "\n");
        const occurrences = content.split(oldString).length - 1;
        if (occurrences === 0) throw new Error("oldString was not found; re-read the file and use exact current text");
        if (expected !== undefined && occurrences !== expected) {
          throw new Error(`Expected ${expected} replacement${expected === 1 ? "" : "s"}, found ${occurrences}`);
        }
        if (occurrences > 1 && !replaceAll && expected === undefined) {
          throw new Error(`oldString matches ${occurrences} locations; set replaceAll or expectedReplacements explicitly`);
        }
        const replaceEveryMatch = replaceAll || (expected !== undefined && expected > 1);
        const firstIndex = content.indexOf(oldString);
        const updated = replaceEveryMatch
          ? content.split(oldString).join(newString)
          : `${content.slice(0, firstIndex)}${newString}${content.slice(firstIndex + oldString.length)}`;
        await fs.writeFile(target.absolute, usesCrLf ? updated.replace(/\n/g, "\r\n") : updated, "utf-8");
        return {
          replacements: replaceEveryMatch ? occurrences : 1,
          startLine: content.slice(0, firstIndex).split("\n").length,
        };
      }));

      const trackingWarning = await tryRecordTouched(root, [target.relative], "CodeEdit", {
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
      });
      return ok(JSON.stringify({
        repoRoot: root,
        file: target.relative,
        ...result,
        ...(trackingWarning ? { trackingWarning } : {}),
      }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const codeApplyPatchTool: ClientToolDefinition = {
  name: "CodeApplyPatch",
  description: "Apply a standard unified Git patch directly to a repository after git apply --check, then record every patch-header file as agent-touched. Use LiveProposePatch instead when human review is required.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      patch: { type: "string", description: "Complete unified Git patch." },
    },
    required: ["patch"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const patch = asString(args.patch);
      if (!patch.trim()) return fail("patch is required");
      const files = extractPatchFiles(patch);
      if (files.length === 0) return fail("Could not determine files from the patch headers");
      const output = await applyPatchFile(root, patch);
      const trackingWarning = await tryRecordTouched(root, files, "CodeApplyPatch", {
        agentId: ctx.agentId,
        conversationId: ctx.conversationId,
      });
      return ok(JSON.stringify({
        repoRoot: root,
        files,
        status: "applied",
        output,
        ...(trackingWarning ? { trackingWarning } : {}),
      }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const codeFormatFilesTool: ClientToolDefinition = {
  name: "CodeFormatFiles",
  description: "Format explicit repository files with language-aware adapters: repo-local Prettier, the TypeScript language service, repo-local Ruff/Black, gofmt, or rustfmt. Auto mode selects per file and records only files whose contents changed.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 200, description: "Repository-relative files to format." },
      formatter: { type: "string", enum: ["auto", "prettier", "typescript", "ruff", "black", "gofmt", "rustfmt"], description: "Formatter selection. Default auto chooses independently for each file." },
    },
    required: ["files"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const targets = await resolveRepoFiles(root, args.files);
      const requestedFormatter = asString(args.formatter, "auto");
      const prettier = localExecutable(root, "prettier");
      if (requestedFormatter === "prettier" && !prettier) return fail("No repository-local Prettier executable was found");
      const ruff = localPythonExecutable(root, "ruff");
      const black = localPythonExecutable(root, "black");
      if (requestedFormatter === "ruff" && !ruff) return fail("No repository-local Ruff executable was found in .venv or venv");
      if (requestedFormatter === "black" && !black) return fail("No repository-local Black executable was found in .venv or venv");
      const changedFiles: string[] = [];
      const unchangedFiles: string[] = [];
      const unsupportedFiles: string[] = [];
      const failures: Array<{ file: string; error: string }> = [];
      const commandOutputs: Array<{ formatter: string; output: string }> = [];
      const formattersByFile: Record<string, string> = {};

      await withStoreLock(`repo:${root}`, async () => {
        if (ctx.signal.aborted) throw new Error("Formatting was cancelled");
        const groups = new Map<string, typeof targets>();
        const prettierExtensions = /\.(?:[cm]?[jt]sx?|jsonc?|css|scss|less|mdx?|ya?ml|html?|vue|svelte|graphql)$/i;
        for (const target of targets) {
          const extension = extname(target.relative).toLowerCase();
          let formatter = requestedFormatter;
          if (formatter === "auto") {
            if (extension === ".py") formatter = ruff ? "ruff" : black ? "black" : "unsupported";
            else if (extension === ".go") formatter = "gofmt";
            else if (extension === ".rs") formatter = "rustfmt";
            else if (prettier && prettierExtensions.test(target.relative)) formatter = "prettier";
            else if (/\.[cm]?[jt]sx?$/i.test(target.relative)) formatter = "typescript";
            else formatter = "unsupported";
          }
          const validForFormatter = formatter === "prettier"
            || (formatter === "typescript" && /\.[cm]?[jt]sx?$/i.test(target.relative))
            || ((formatter === "ruff" || formatter === "black") && extension === ".py")
            || (formatter === "gofmt" && extension === ".go")
            || (formatter === "rustfmt" && extension === ".rs");
          if (!validForFormatter) {
            unsupportedFiles.push(target.relative);
            continue;
          }
          formattersByFile[target.relative] = formatter;
          groups.set(formatter, [...(groups.get(formatter) ?? []), target]);
        }

        const typescriptTargets = groups.get("typescript") ?? [];
        if (typescriptTargets.length > 0) {
          const { lspManager } = await import("../lsp/manager.js");
          for (const target of typescriptTargets) {
            if (ctx.signal.aborted) throw new Error("Formatting was cancelled");
            try {
              const before = await fs.readFile(target.absolute, "utf-8");
              const formatted = await lspManager.formatFile(target.absolute);
              if (formatted.text === before) unchangedFiles.push(target.relative);
              else {
                await fs.writeFile(target.absolute, formatted.text, "utf-8");
                changedFiles.push(target.relative);
              }
            } catch (error) {
              failures.push({ file: target.relative, error: error instanceof Error ? error.message : String(error) });
            }
          }
        }

        for (const [formatter, formatterTargets] of groups) {
          if (formatter === "typescript" || formatterTargets.length === 0) continue;
          if (ctx.signal.aborted) throw new Error("Formatting was cancelled");
          const executable = formatter === "prettier" ? prettier
            : formatter === "ruff" ? ruff
              : formatter === "black" ? black
                : formatter;
          if (!executable) {
            failures.push({ file: `<${formatter}>`, error: `${formatter} executable is unavailable` });
            continue;
          }
          const before = new Map(await Promise.all(formatterTargets.map(async (target) => [target.relative, await fs.readFile(target.absolute, "utf-8")] as const)));
          const paths = formatterTargets.map((target) => formatter === "prettier" ? target.relative : target.absolute);
          const formatterArgs = formatter === "prettier" ? ["--write", "--", ...paths]
            : formatter === "ruff" ? ["format", "--", ...paths]
              : formatter === "black" ? ["--", ...paths]
                : formatter === "gofmt" ? ["-w", ...paths]
                  : ["--", ...paths];
          let commandError: string | undefined;
          try {
            const output = await run(executable, formatterArgs, {
              cwd: root,
              timeout: 300_000,
              runtimeEnv: ctx.runtimeEnv,
              signal: ctx.signal,
            });
            commandOutputs.push({ formatter, output });
          } catch (error) {
            if (ctx.signal.aborted) throw new Error("Formatting was cancelled");
            commandError = error instanceof Error ? error.message : String(error);
          }
          let groupChanged = 0;
          for (const target of formatterTargets) {
            const after = await fs.readFile(target.absolute, "utf-8");
            if (after === before.get(target.relative)) {
              if (!commandError) unchangedFiles.push(target.relative);
            } else {
              changedFiles.push(target.relative);
              groupChanged += 1;
            }
          }
          if (commandError) {
            failures.push({ file: `<${formatter}>`, error: commandError });
            if (groupChanged === 0) commandOutputs.push({ formatter, output: commandError });
          }
        }
      });

      if (changedFiles.length === 0 && unchangedFiles.length === 0 && failures.length > 0) {
        return fail(failures.map((failure) => `${failure.file}: ${failure.error}`).join("\n"));
      }
      if (changedFiles.length === 0 && unchangedFiles.length === 0 && unsupportedFiles.length > 0) {
        return fail("None of the requested files have an available language formatter");
      }
      const trackingWarning = changedFiles.length > 0
        ? await tryRecordTouched(root, changedFiles, "CodeFormatFiles", { agentId: ctx.agentId, conversationId: ctx.conversationId })
        : undefined;
      return ok(JSON.stringify({
        repoRoot: root,
        formatter: requestedFormatter,
        formattersByFile,
        status: failures.length > 0 ? "partial" : "formatted",
        changedFiles,
        unchangedFiles,
        unsupportedFiles,
        failures,
        ...(commandOutputs.length > 0 ? { outputs: commandOutputs } : {}),
        ...(trackingWarning ? { trackingWarning } : {}),
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

const codeOrganizeImportsTool: ClientToolDefinition = {
  name: "CodeOrganizeImports",
  description: "Organize imports in explicit JavaScript/TypeScript files with the project-aware TypeScript language service. Defaults to safe sort-and-combine mode; mode=all also removes unused imports.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 200, description: "Repository-relative JavaScript/TypeScript files." },
      mode: { type: "string", enum: ["sort-and-combine", "remove-unused", "all"], description: "Default sort-and-combine. all sorts and removes unused imports." },
    },
    required: ["files"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const targets = await resolveRepoFiles(root, args.files);
      const modeValue = asString(args.mode, "sort-and-combine");
      const mode = (["sort-and-combine", "remove-unused", "all"].includes(modeValue) ? modeValue : "sort-and-combine") as "sort-and-combine" | "remove-unused" | "all";
      const changedFiles: string[] = [];
      const unchangedFiles: string[] = [];
      const unsupportedFiles: string[] = [];
      const failures: Array<{ file: string; error: string }> = [];
      const editsByFile: Record<string, number> = {};
      const supported = /\.(?:[cm]?[jt]sx?)$/i;

      await withStoreLock(`repo:${root}`, async () => {
        const { lspManager } = await import("../lsp/manager.js");
        for (const target of targets) {
          if (ctx.signal.aborted) throw new Error("Import organization was cancelled");
          if (!supported.test(target.relative)) {
            unsupportedFiles.push(target.relative);
            continue;
          }
          try {
            const before = await fs.readFile(target.absolute, "utf-8");
            const organized = await lspManager.organizeImports(target.absolute, mode);
            editsByFile[target.relative] = organized.edits;
            if (organized.text === before) {
              unchangedFiles.push(target.relative);
            } else {
              await fs.writeFile(target.absolute, organized.text, "utf-8");
              changedFiles.push(target.relative);
            }
          } catch (error) {
            failures.push({ file: target.relative, error: error instanceof Error ? error.message : String(error) });
          }
        }
      });

      if (changedFiles.length === 0 && unchangedFiles.length === 0 && failures.length > 0) {
        return fail(failures.map((failure) => `${failure.file}: ${failure.error}`).join("\n"));
      }
      if (changedFiles.length === 0 && unchangedFiles.length === 0 && unsupportedFiles.length > 0) {
        return fail("None of the requested files are JavaScript or TypeScript files");
      }
      const trackingWarning = changedFiles.length > 0
        ? await tryRecordTouched(root, changedFiles, "CodeOrganizeImports", { agentId: ctx.agentId, conversationId: ctx.conversationId })
        : undefined;
      return ok(JSON.stringify({
        repoRoot: root,
        mode,
        status: failures.length > 0 ? "partial" : "organized",
        changedFiles,
        unchangedFiles,
        unsupportedFiles,
        failures,
        editsByFile,
        ...(trackingWarning ? { trackingWarning } : {}),
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

const testFindRelatedTool: ClientToolDefinition = {
  name: "TestFindRelated",
  description: "Find JavaScript, TypeScript, Python, Go, and Rust tests related to explicit repository files. Uses Jest's dependency graph when available and safely falls back to direct-test, path/basename, and language import relationships. Does not run tests.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 200, description: "Repository-relative source or test files." },
      limit: { type: "number", minimum: 1, maximum: 200, description: "Maximum related tests. Default 100." },
    },
    required: ["files"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const targets = await resolveRepoFiles(root, args.files);
      const sourceFiles = targets.map((target) => target.relative);
      const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 200);
      const runner = sourceFiles.every((file) => languageFamily(file) === "javascript")
        ? await resolveTestRunner(root, "", sourceFiles).catch(() => undefined)
        : undefined;
      const discovery = await discoverRelatedTests(root, sourceFiles, limit, runner, ctx.runtimeEnv, ctx.signal);
      return ok(JSON.stringify({
        repoRoot: root,
        sourceFiles,
        relatedTests: discovery.relatedTests,
        count: discovery.relatedTests.length,
        strategy: discovery.strategy,
        ...(discovery.warning ? { warning: discovery.warning } : {}),
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

const testRunRelatedTool: ClientToolDefinition = {
  name: "TestRunRelated",
  description: "Discover and run tests related to explicit repository files with a detected local test runner or package test script. Uses native Vitest/Jest dependency selection when available. Test assertion failures are returned as status=failed rather than a tool transport error.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      files: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 200, description: "Repository-relative source or test files." },
      script: { type: "string", description: "Optional package.json test script override." },
      limit: { type: "number", minimum: 1, maximum: 200, description: "Maximum related test files. Default 100." },
      timeoutMs: { type: "number", minimum: 1000, maximum: 900000, description: "Execution timeout. Default 300000." },
    },
    required: ["files"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const targets = await resolveRepoFiles(root, args.files);
      const sourceFiles = targets.map((target) => target.relative);
      const limit = Math.min(Math.max(Number(args.limit) || 100, 1), 200);
      let runner = await resolveTestRunner(root, asString(args.script), sourceFiles);
      const discovery = await discoverRelatedTests(root, sourceFiles, limit, runner, ctx.runtimeEnv, ctx.signal);
      const testFiles = discovery.relatedTests.map((test) => test.file);
      let executionFiles = testFiles;
      let strategy: RelatedTestDiscovery["strategy"] | "vitest-dependency-graph" = discovery.strategy;
      if (runner.kind === "vitest") {
        const executable = localExecutable(root, "vitest");
        const pkg = await readPackage(root);
        const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
        const scriptCommand = runner.script ? scripts[runner.script]?.trim() : undefined;
        const canUseNativeSelection = !runner.script || /^vitest(?:\s+run)?$/i.test(scriptCommand ?? "");
        if (executable && canUseNativeSelection) {
          runner = { kind: "vitest", command: executable, baseArgs: ["related", "--run"] };
          executionFiles = sourceFiles;
          strategy = "vitest-dependency-graph";
        }
      }
      if (executionFiles.length === 0) return fail("No related tests were found");
      const execution = await executeTests(root, runner, executionFiles, undefined, Number(args.timeoutMs) || 300_000, ctx);
      return ok(JSON.stringify({
        repoRoot: root,
        sourceFiles,
        relatedTests: discovery.relatedTests,
        testFiles,
        strategy,
        selectionInputs: executionFiles,
        ...(discovery.warning ? { warning: discovery.warning } : {}),
        runner: { kind: runner.kind, ...(runner.script ? { script: runner.script } : {}) },
        ...execution,
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

const testRunByNameTool: ClientToolDefinition = {
  name: "TestRunByName",
  description: "Run tests matching a name or pattern with a detected Vitest, Jest, Bun, Node, Playwright, pytest, Go, or Cargo runner. Optional files constrain the run to explicit repository test files.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Repository path. Defaults to the current working directory." },
      name: { type: "string", minLength: 1, description: "Runner-specific test name or pattern." },
      files: { type: "array", items: { type: "string" }, maxItems: 200, description: "Optional repository-relative test files." },
      script: { type: "string", description: "Optional package.json test script override." },
      timeoutMs: { type: "number", minimum: 1000, maximum: 900000, description: "Execution timeout. Default 300000." },
    },
    required: ["name"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const name = asString(args.name).trim();
      if (!name) return fail("name is required");
      const targets = args.files === undefined ? [] : await resolveRepoFiles(root, args.files);
      const nonTests = targets.map((target) => target.relative).filter((file) => !isTestFile(file));
      if (nonTests.length > 0) return fail(`files must be test files: ${nonTests.join(", ")}`);
      const testFiles = targets.map((target) => target.relative);
      const runner = await resolveTestRunner(root, asString(args.script), testFiles);
      const execution = await executeTests(root, runner, testFiles, name, Number(args.timeoutMs) || 300_000, ctx);
      return ok(JSON.stringify({
        repoRoot: root,
        name,
        testFiles,
        runner: { kind: runner.kind, ...(runner.script ? { script: runner.script } : {}) },
        ...execution,
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

function markdownText(value: unknown, fallback: string): string {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return text.replace(/[\u0000-\u001f\u007f|`]+/g, " ").replace(/\s+/g, " ").trim();
}

async function projectMemoryBase(root: string, create = false): Promise<string> {
  const base = join(root, ".cowork");
  if (!existsSync(base)) {
    if (create) await fs.mkdir(base, { recursive: true });
    else return base;
  }
  const stats = await fs.lstat(base);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(".cowork must be a real directory inside the project");
  }
  return base;
}

function packageScriptCommand(packageManager: string, script: string): string {
  if (packageManager === "yarn") return `yarn ${script}`;
  const command = packageManager === "unknown" ? "npm" : packageManager;
  return `${command} run ${script}`;
}

async function createProjectProfile(root: string): Promise<string> {
  const pkg = await readPackage(root);
  const scripts = (pkg?.scripts as Record<string, string> | undefined) ?? {};
  const packageManager = detectPackageManager(root);
  const frameworks = inferFrameworks(pkg, root);
  const entries = existsSync(root) ? await fs.readdir(root) : [];
  const importantDirs = entries
    .filter((entry) => ["src", "test", "tests", "docs", "scripts", "packages", "services", "apps"].includes(entry))
    .sort();
  const knownConfigs = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "electron-builder.json",
    "eslint.config.js",
    "nest-cli.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
  ].filter((file) => existsSync(join(root, file)));
  const projectFiles = await listFiles(root, 1000);
  const entrypoints = projectFiles
    .filter((file) => classifyFile(file) === "entrypoint")
    .slice(0, 12);
  const scriptNames = Object.keys(scripts).sort().slice(0, 40);
  const projectName = markdownText(pkg?.name, basename(root));

  const lines = [
    `# ${projectName} Project Profile`,
    "",
    "> Cowork project memory. Keep this file concise, current, portable, and free of secrets.",
    "",
    "## Overview",
    "",
    "- **Repository:** `.`",
    `- **Package manager:** ${markdownText(packageManager, "unknown")}`,
    `- **Frameworks:** ${frameworks.length > 0 ? frameworks.map((item) => markdownText(item, "unknown")).join(", ") : "Not detected"}`,
    "",
    "## Common commands",
    "",
    ...(scriptNames.length > 0
      ? scriptNames.map((script) => `- \`${packageScriptCommand(packageManager, markdownText(script, "script"))}\``)
      : ["- No package scripts detected. Add verified project commands here when known."]),
    "",
    "## Important paths",
    "",
    ...(importantDirs.length > 0
      ? importantDirs.map((directory) => `- \`${directory}/\``)
      : ["- No conventional source, test, or documentation directories detected."]),
    ...(knownConfigs.length > 0 ? knownConfigs.map((file) => `- \`${file}\``) : []),
    ...(entrypoints.length > 0
      ? ["", "### Likely entrypoints", "", ...entrypoints.map((file) => `- \`${markdownText(file, "unknown")}\``)]
      : []),
    "",
    "## Durable project memory",
    "",
    "Create files under `.cowork/memory/` only when there is durable information to preserve:",
    "",
    "- `architecture.md` — stable system boundaries and component responsibilities",
    "- `decisions.md` — decisions that continue to affect implementation",
    "- `workflows.md` — verified development and release procedures",
    "- `testing.md` — validated test commands and expectations",
    "- `gotchas.md` — recurring problems and non-obvious constraints",
    "- `current-work.md` — active context that should survive sessions",
    "",
    "## Agent workflow",
    "",
    "1. Read this profile and search `.cowork/` before asking for repeated project context.",
    "2. Inspect the repository and run the smallest relevant diagnostic before editing.",
    "3. Preserve unrelated dirty files and validate only the intended change set.",
    "4. Save distilled durable facts, not raw transcripts, generated output, or secrets.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

const projectMemoryBootstrapTool: ClientToolDefinition = {
  name: "ProjectMemoryBootstrap",
  description: "Create a minimal .cowork/project.md profile for a repository that does not have Cowork project memory yet. Never overwrites an existing profile.",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "Project path. Defaults to the current working directory." },
    },
    additionalProperties: false,
  },
  run: async (args) => {
    try {
      const root = await gitRoot(resolve(asString(args.projectPath, cwd())));
      const base = await projectMemoryBase(root);
      const target = join(base, "project.md");
      if (existsSync(target)) {
        return ok(JSON.stringify({
          status: "existing",
          repoRoot: root,
          profile: ".cowork/project.md",
          created: [],
        }, null, 2));
      }

      const content = await createProjectProfile(root);
      await projectMemoryBase(root, true);
      try {
        await fs.writeFile(target, content, { encoding: "utf-8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        return ok(JSON.stringify({
          status: "existing",
          repoRoot: root,
          profile: ".cowork/project.md",
          created: [],
        }, null, 2));
      }
      return ok(JSON.stringify({
        status: "created",
        repoRoot: root,
        profile: ".cowork/project.md",
        created: [".cowork/project.md"],
      }, null, 2));
    } catch (e) {
      return fail(e);
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
      const base = await projectMemoryBase(root);
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
      const hasProjectProfile = existsSync(join(base, "project.md"));
      return ok(JSON.stringify({
        repoRoot: root,
        hasProjectProfile,
        memoryFiles: files.sort(),
        recommendedAction: hasProjectProfile
          ? "Read project.md and search project memory before asking for repeated context."
          : "Run ProjectMemoryBootstrap to create a non-overwriting .cowork/project.md profile.",
      }, null, 2));
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
      if (!patch.trim()) return fail("patch is required");
      const files = extractPatchFiles(patch);
      if (files.length === 0) return fail("Could not determine files from the patch headers.");
      const declaredFiles = asStringArray(args.files);
      if (declaredFiles.length > 0) {
        const actual = [...files].sort();
        const declared = [...new Set(declaredFiles)].sort();
        if (JSON.stringify(actual) !== JSON.stringify(declared)) {
          return fail(`Declared files do not match patch headers. Patch modifies: ${actual.join(", ")}`);
        }
      }
      const proposal = await withStoreLock(LIVE_PATCH_FILE, async () => {
        const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
        const now = new Date().toISOString();
        const next: LivePatchProposal = {
          id: `patch-${Date.now()}-${randomUUID()}`,
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
        proposals.push(next);
        await writeJson(LIVE_PATCH_FILE, proposals.slice(-500));
        return next;
      });
      return ok(JSON.stringify({
        proposalId: proposal.id,
        title: proposal.title,
        status: proposal.status,
        files: proposal.files,
        reviewFiles: parsePatchFiles(proposal.patch).map((file) => ({
          id: file.id,
          path: file.path,
          hunkSelectable: file.hunkSelectable,
          hunkIds: file.hunks.map((hunk) => hunk.id),
        })),
        riskLevel: proposal.riskLevel,
        summary: proposal.summary,
      }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const liveRegeneratePatchTool: ClientToolDefinition = {
  name: "LiveRegeneratePatch",
  description: "Replace a conflicted pending live-patch proposal with a newly generated patch against the current repository. The original proposal is preserved as superseded and linked to the replacement for review.",
  parameters: {
    type: "object",
    properties: {
      proposalId: { type: "string", description: "Conflicted pending proposal being replaced." },
      patch: { type: "string", description: "Complete replacement unified Git patch generated against current files." },
      files: { type: "array", items: { type: "string" }, description: "Optional declared replacement files; must exactly match patch headers." },
      title: { type: "string", description: "Optional replacement title." },
      summary: { type: "string", description: "Optional updated summary." },
      riskLevel: { type: "string", enum: ["low", "medium", "high"] },
      validationPlan: { type: "array", items: { type: "string" } },
    },
    required: ["proposalId", "patch"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const id = requireProposalId(args.proposalId);
      const patch = asString(args.patch);
      if (!patch.trim()) return fail("patch is required");
      const files = extractPatchFiles(patch);
      if (files.length === 0) return fail("Could not determine files from the replacement patch headers.");
      const declaredFiles = asStringArray(args.files);
      if (declaredFiles.length > 0) {
        const actual = [...files].sort();
        const declared = [...new Set(declaredFiles)].sort();
        if (JSON.stringify(actual) !== JSON.stringify(declared)) {
          return fail(`Declared files do not match replacement patch headers. Patch modifies: ${actual.join(", ")}`);
        }
      }
      const replacement = await withStoreLock(LIVE_PATCH_FILE, async () => {
        const proposals = await readJson<LivePatchProposal[]>(LIVE_PATCH_FILE, []);
        const original = proposals.find((proposal) => proposal.id === id);
        if (!original) throw new Error("proposal not found");
        if (original.status !== "pending") throw new Error(`proposal is ${original.status}, not pending`);
        if (!original.conflict) throw new Error("proposal has no stored conflict analysis to regenerate from");
        if (patch === original.patch) throw new Error("replacement patch must differ from the conflicted patch");
        const now = new Date().toISOString();
        const next: LivePatchProposal = {
          id: `patch-${Date.now()}-${randomUUID()}`,
          title: asString(args.title, `Revised: ${original.title}`),
          summary: asString(args.summary, original.summary),
          repoRoot: original.repoRoot,
          patch,
          files,
          riskLevel: ["low", "medium", "high"].includes(asString(args.riskLevel))
            ? asString(args.riskLevel) as "low" | "medium" | "high"
            : original.riskLevel,
          validationPlan: args.validationPlan === undefined ? [...original.validationPlan] : asStringArray(args.validationPlan),
          status: "pending",
          createdAt: now,
          updatedAt: now,
          agentId: ctx.agentId ?? original.agentId,
          conversationId: ctx.conversationId ?? original.conversationId,
          supersedesProposalId: original.id,
        };
        original.status = "superseded";
        original.supersededByProposalId = next.id;
        original.updatedAt = now;
        proposals.push(next);
        const retained = proposals.length <= 500
          ? proposals
          : [original, ...proposals.filter((proposal) => proposal !== original).slice(-499)];
        await writeJson(LIVE_PATCH_FILE, retained);
        return next;
      });
      return ok(JSON.stringify({
        proposalId: replacement.id,
        supersedesProposalId: replacement.supersedesProposalId,
        title: replacement.title,
        status: replacement.status,
        files: replacement.files,
        reviewFiles: parsePatchFiles(replacement.patch).map((file) => ({
          id: file.id,
          path: file.path,
          hunkSelectable: file.hunkSelectable,
          hunkIds: file.hunks.map((hunk) => hunk.id),
        })),
        riskLevel: replacement.riskLevel,
        summary: replacement.summary,
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

const liveApplyPatchTool: ClientToolDefinition = {
  name: "LiveApplyPatch",
  description: "Apply all or a reviewed file/hunk selection from a pending LiveProposePatch. Selection IDs must come from the stored proposal; omitted selection applies all. Records applied files as agent-touched.",
  parameters: {
    type: "object",
    properties: {
      proposalId: { type: "string" },
      fileIds: { type: "array", items: { type: "string" }, description: "Stored file IDs to apply in full." },
      hunkIds: { type: "array", items: { type: "string" }, description: "Stored hunk IDs to apply independently." },
    },
    required: ["proposalId"],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    try {
      const hasSelection = args.fileIds !== undefined || args.hunkIds !== undefined;
      const selection = hasSelection ? { fileIds: asStringArray(args.fileIds), hunkIds: asStringArray(args.hunkIds) } : undefined;
      const { proposal, output, trackingWarning } = await applyLivePatchProposal(asString(args.proposalId), ctx, selection);
      return ok(JSON.stringify({
        proposalId: proposal.id,
        status: proposal.status,
        files: proposal.appliedFiles ?? proposal.files,
        appliedFileIds: proposal.appliedFileIds ?? [],
        appliedHunkIds: proposal.appliedHunkIds ?? [],
        output,
        ...(trackingWarning ? { trackingWarning } : {}),
      }, null, 2));
    } catch (e) {
      return fail(e);
    }
  },
};

const liveUndoPatchTool: ClientToolDefinition = {
  name: "LiveUndoPatch",
  description: "Undo an applied live patch using its exact stored applied selection. Refuses if any affected file changed after application. Use only after explicit user instruction.",
  parameters: { type: "object", properties: { proposalId: { type: "string" } }, required: ["proposalId"], additionalProperties: false },
  run: async (args, ctx) => {
    try {
      const { proposal, output, trackingWarning } = await undoLivePatchProposal(asString(args.proposalId), ctx);
      return ok(JSON.stringify({
        proposalId: proposal.id,
        status: proposal.status,
        files: proposal.appliedFiles ?? [],
        output,
        ...(trackingWarning ? { trackingWarning } : {}),
      }, null, 2));
    } catch (error) {
      return fail(error);
    }
  },
};

const liveRejectPatchTool: ClientToolDefinition = {
  name: "LiveRejectPatch",
  description: "Reject a pending live patch proposal without changing files.",
  parameters: { type: "object", properties: { proposalId: { type: "string" }, reason: { type: "string" } }, required: ["proposalId"], additionalProperties: false },
  run: async (args) => {
    try {
      const proposal = await rejectLivePatchProposal(asString(args.proposalId), asString(args.reason, "Rejected by user"));
      return ok(JSON.stringify({ proposalId: proposal.id, status: proposal.status, reason: proposal.rejectionReason }, null, 2));
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
        proposals: proposals
          .filter((item) => item.repoRoot === repoRoot && (!args.proposalId || item.id === args.proposalId))
          .slice(-50)
          .map(proposalForReview),
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
  codeEditTool,
  codeApplyPatchTool,
  codeFormatFilesTool,
  codeOrganizeImportsTool,
  testFindRelatedTool,
  testRunRelatedTool,
  testRunByNameTool,
  projectRunScriptTool,
  projectMemoryBootstrapTool,
  projectMemoryStatusTool,
  projectMemoryReadTool,
  projectMemoryWriteTool,
  projectMemorySearchTool,
  liveProposePatchTool,
  liveRegeneratePatchTool,
  liveApplyPatchTool,
  liveUndoPatchTool,
  liveRejectPatchTool,
  liveDiffStatusTool,
  gitChangedByAgentTool,
  gitDiffSummaryTool,
  logSearchTool,
];
