import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { getCurrentWorkingDirectory } from "./runtime-context.js";

const exec = promisify(execFile);
export async function resolveProjectScope(path?: string) {
  const requestedPath = resolve(getCurrentWorkingDirectory(), path?.trim() || ".");
  const stat = await fs.stat(requestedPath);
  const directory = await fs.realpath(stat.isDirectory() ? requestedPath : dirname(requestedPath));
  let repoRoot = directory;
  let hasGit = false;
  try {
    const result = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: directory, timeout: 10000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } });
    repoRoot = await fs.realpath(result.stdout.trim());
    hasGit = true;
  } catch { /* A non-git directory remains a valid project. */ }
  let packageRoot: string | undefined;
  const memoryRoots: string[] = [];
  for (let current = directory; ; current = dirname(current)) {
    if (!packageRoot && await fs.stat(join(current, "package.json")).then(s => s.isFile(), () => false)) packageRoot = current;
    const memory = await fs.lstat(join(current, ".cowork")).catch(() => undefined);
    if (memory) {
      if (!memory.isDirectory() || memory.isSymbolicLink()) throw new Error(".cowork must be a real project directory, not a symlink");
      memoryRoots.push(current);
    }
    if (current === repoRoot || dirname(current) === current) break;
  }
  return { requestedPath, directory, repoRoot, projectRoot: packageRoot ?? directory, packageRoot, memoryRoot: memoryRoots[0] ?? repoRoot, memoryRoots, hasGit };
}

export async function resolveProjectMemoryFile(memoryRoot: string, file: string): Promise<string> {
  const base = join(memoryRoot, ".cowork");
  const target = resolve(base, file);
  const rel = relative(base, target);
  if (!file || isAbsolute(file) || /^[A-Za-z]:|^[\\/]/.test(file) || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("file must stay under project .cowork/");
  let current = base;
  for (const part of ["", ...rel.split(sep)]) {
    if (part) current = join(current, part);
    const stat = await fs.lstat(current).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new Error("Project memory must not follow symlinks");
  }
  return target;
}

/** Bounded discovery of durable notes, not generated patch/trace stores. */
export async function projectMemorySummary(scope: Awaited<ReturnType<typeof resolveProjectScope>>) {
  const files: string[] = [];
  async function walk(directory: string, depth = 0): Promise<void> {
    if (depth > 5 || files.length >= 100) return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= 100) break;
      const full = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && (depth > 0 || entry.name === "memory")) await walk(full, depth + 1);
      else if (entry.isFile() && /\.(md|txt)$/i.test(entry.name)) files.push(relative(scope.repoRoot, full));
    }
  }
  for (const root of scope.memoryRoots) await walk(join(root, ".cowork"));
  const profile = await resolveProjectMemoryFile(scope.memoryRoot, "project.md");
  const profileStat = await fs.lstat(profile).catch(() => undefined);
  let profileExcerpt: string | undefined;
  if (profileStat?.isFile()) {
    const handle = await fs.open(profile, "r");
    try {
      const buffer = Buffer.alloc(8000);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      profileExcerpt = buffer.subarray(0, bytesRead).toString("utf8");
    } finally { await handle.close(); }
  }
  return {
    memoryRoot: scope.memoryRoot,
    memoryRoots: scope.memoryRoots,
    hasProjectProfile: profileStat?.isFile() ?? false,
    profilePath: profileStat?.isFile() ? relative(scope.repoRoot, profile) : undefined,
    profileModifiedAt: profileStat?.mtime.toISOString(),
    profileExcerpt,
    profileTruncated: (profileStat?.size ?? 0) > 8000,
    memoryFiles: files,
    guidance: "Saved notes are context, not fresh verification. Compare commands and versions with current package files; read relevant memory before rediscovering architecture. No notes are rewritten automatically.",
  };
}
