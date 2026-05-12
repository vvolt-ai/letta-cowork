/**
 * memfsGit — git-backed access to Letta agent memory.
 *
 * Mirrors the exact mechanism used by @letta-ai/letta-code's `memoryGit`
 * subsystem so behavior in letta-cowork is consistent with the bundled
 * `letta memfs` CLI:
 *
 *   1. Auth: each git invocation is prefixed with
 *        `-c http.extraHeader="Authorization: Basic <base64(letta:token)>"`
 *      Token never appears in URLs or process tables.
 *
 *   2. Credential helper: configured *locally* per-repo via
 *        `git config credential.<base-url>.helper '!f() { ... }; f'`
 *      Both raw and normalized base URLs registered. Lets external git
 *      operations in the same checkout authenticate too.
 *
 *   3. Layout: `~/.letta/agents/<agent-id>/memory/` (matches letta-code).
 *
 *   4. Remote: `<base-url>/v1/git/<agent-id>/state.git`.
 *
 *   5. Pre-commit hook: installed on clone and re-installed on every
 *      pull. Validates frontmatter and enforces `read_only: true`.
 *
 *   6. Migration: if the memory dir exists without `.git` (e.g. agent
 *      existed before git-backed memfs), clones to a temp dir and
 *      transplants `.git/` in to preserve existing files.
 *
 *   7. Pull: `--ff-only` first, falls back to `--rebase`, then returns
 *      a diagnostic hint on failure.
 *
 * Env vars consumed (same names letta-cowork uses elsewhere):
 *   - LETTA_API_KEY   (required for any network op)
 *   - LETTA_BASE_URL  (defaults to https://api.letta.com)
 *   - MEMFS_CACHE_DIR (optional, defaults to ~/.letta/agents)
 *
 * This is a plain TypeScript module — no NestJS, no class state. The
 * cowork-server has a NestJS-flavored equivalent in
 * services/vera-cowork-server/src/letta-memfs/memfs.service.ts that
 * shares the same surface and behavior.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import { existsSync, renameSync, rmSync } from "fs";
import { homedir } from "os";
import { join, dirname, relative } from "path";
import { PRE_COMMIT_HOOK_SCRIPT } from "./preCommitHook.js";

const execFileAsync = promisify(execFile);

const AGENT_ID_RE = /^agent-[a-f0-9-]{36}$/i;

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function getCacheRoot(): string {
  const fromEnv = process.env.MEMFS_CACHE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".letta", "agents");
}

/**
 * Letta API origin used for the git remote and credential scope.
 *
 * letta-cowork reads `LETTA_BASE_URL` without a trailing path elsewhere,
 * but we tolerate `.../v1` suffixes that other services use.
 */
function getRawBaseUrl(): string {
  const raw = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
  return raw.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function normalizeCredentialBaseUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, "");
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function getToken(): string {
  return (process.env.LETTA_API_KEY || "").trim();
}

function assertReady(agentId: string): void {
  if (!AGENT_ID_RE.test(agentId)) {
    throw new Error(`Invalid agent id: ${agentId}`);
  }
  if (!getToken()) {
    throw new Error("LETTA_API_KEY is not configured");
  }
}

// ---------------------------------------------------------------------------
// Path helpers (mirror letta-code's getMemoryRepoDir / getGitRemoteUrl)
// ---------------------------------------------------------------------------

export function getMemoryRepoDir(agentId: string): string {
  if (!AGENT_ID_RE.test(agentId)) {
    throw new Error(`Invalid agent id: ${agentId}`);
  }
  return join(getCacheRoot(), agentId, "memory");
}

function getGitRemoteUrl(agentId: string): string {
  return `${getRawBaseUrl()}/v1/git/${agentId}/state.git`;
}

export function isGitRepo(agentId: string): boolean {
  return existsSync(join(getMemoryRepoDir(agentId), ".git"));
}

function safeJoin(root: string, rel: string): string {
  const normalized = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.split("/").includes("..")) {
    throw new Error(`Refusing path traversal: ${rel}`);
  }
  return join(root, normalized);
}

// ---------------------------------------------------------------------------
// Git plumbing
// ---------------------------------------------------------------------------

/**
 * Run git, prefixing with the Basic auth http.extraHeader when a token
 * is supplied. Token never appears in args we log.
 */
async function runGit(
  cwd: string,
  args: string[],
  token?: string,
): Promise<{ stdout: string; stderr: string }> {
  const authArgs = token
    ? [
        "-c",
        `http.extraHeader=Authorization: Basic ${Buffer.from(`letta:${token}`).toString("base64")}`,
      ]
    : [];
  const allArgs = [...authArgs, ...args];

  try {
    const result = await execFileAsync("git", allArgs, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    return {
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
    };
  } catch (err) {
    const e = err as { stdout?: unknown; stderr?: unknown; message?: string };
    const stderr =
      typeof e?.stderr === "string"
        ? e.stderr
        : (e?.stderr as Buffer | undefined)?.toString?.() ?? "";
    const stdout =
      typeof e?.stdout === "string"
        ? e.stdout
        : (e?.stdout as Buffer | undefined)?.toString?.() ?? "";
    const safe = args.map((a) => (a.includes("password") ? "<redacted>" : a));
    throw new Error(
      `git ${safe.join(" ")} failed: ${
        stderr.trim() || stdout.trim() || e?.message || "unknown error"
      }`,
    );
  }
}

/**
 * Configure per-repo credential helper so external git operations in
 * the same checkout authenticate. Mirrors letta-code: registers both
 * the normalized origin and (if different) the raw base URL.
 */
async function configureLocalCredentialHelper(
  dir: string,
  token: string,
): Promise<void> {
  const rawBaseUrl = getRawBaseUrl();
  const normalizedBaseUrl = normalizeCredentialBaseUrl(rawBaseUrl);
  const helper = `!f() { echo "username=letta"; echo "password=${token}"; }; f`;
  await runGit(dir, [
    "config",
    `credential.${normalizedBaseUrl}.helper`,
    helper,
  ]);
  if (rawBaseUrl !== normalizedBaseUrl) {
    await runGit(dir, [
      "config",
      `credential.${rawBaseUrl}.helper`,
      helper,
    ]);
  }
}

async function installPreCommitHook(dir: string): Promise<void> {
  const hooksDir = join(dir, ".git", "hooks");
  const hookPath = join(hooksDir, "pre-commit");
  await fs.mkdir(hooksDir, { recursive: true });
  await fs.writeFile(hookPath, PRE_COMMIT_HOOK_SCRIPT, "utf-8");
  await fs.chmod(hookPath, 0o755);
}

// ---------------------------------------------------------------------------
// Public API — same surface as cowork-server's MemFsService
// ---------------------------------------------------------------------------

/**
 * Clone the agent's memory repo if not already present. Handles the
 * existing-dir-without-git migration case. Returns the local path.
 */
export async function cloneMemoryRepo(agentId: string): Promise<string> {
  assertReady(agentId);
  const token = getToken();
  const url = getGitRemoteUrl(agentId);
  const dir = getMemoryRepoDir(agentId);

  if (!existsSync(dir)) {
    // Fresh clone.
    await fs.mkdir(dir, { recursive: true });
    await runGit(dir, ["clone", url, "."], token);
  } else if (!existsSync(join(dir, ".git"))) {
    // Migration: directory exists with content but no git. Clone to a
    // temp dir, transplant the .git in, then checkout to reconcile.
    const tmpDir = `${dir}-git-clone-tmp`;
    try {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
      await fs.mkdir(tmpDir, { recursive: true });
      await runGit(tmpDir, ["clone", url, "."], token);
      renameSync(join(tmpDir, ".git"), join(dir, ".git"));
      await runGit(dir, ["checkout", "--", "."], token);
    } finally {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  }

  await configureLocalCredentialHelper(dir, token);
  await installPreCommitHook(dir);
  return dir;
}

/**
 * Pull the latest from the Letta-hosted remote. Re-installs the
 * credential helper and pre-commit hook on every call.
 */
export async function pullMemory(
  agentId: string,
): Promise<{ updated: boolean; summary: string }> {
  assertReady(agentId);
  const token = getToken();
  const dir = getMemoryRepoDir(agentId);

  if (!isGitRepo(agentId)) {
    await cloneMemoryRepo(agentId);
    return { updated: true, summary: "Initial clone" };
  }

  await configureLocalCredentialHelper(dir, token);
  await installPreCommitHook(dir);

  try {
    const { stdout, stderr } = await runGit(dir, ["pull", "--ff-only"], token);
    const output = stdout + stderr;
    const updated = !output.includes("Already up to date");
    return {
      updated,
      summary: updated ? output.trim() : "Already up to date",
    };
  } catch {
    try {
      const { stdout, stderr } = await runGit(
        dir,
        ["pull", "--rebase"],
        token,
      );
      return { updated: true, summary: (stdout + stderr).trim() };
    } catch (rebaseErr) {
      const msg =
        rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr);
      return {
        updated: false,
        summary:
          `Pull failed: ${msg}\nHint: verify remote and auth:\n` +
          `- git -C ${dir} remote -v\n` +
          `- git -C ${dir} config --get-regexp '^credential\\..*\\.helper$'`,
      };
    }
  }
}

/**
 * Ensure the agent memory is cloned and up-to-date. Returns the path.
 *
 * Use this from any code path that wants to read the memory tree and
 * doesn't already know whether the repo is initialized.
 */
export async function ensureCheckout(agentId: string): Promise<string> {
  if (!isGitRepo(agentId)) {
    await cloneMemoryRepo(agentId);
  } else {
    await pullMemory(agentId);
  }
  return getMemoryRepoDir(agentId);
}

/** Stage, commit (if anything to commit), and push. Returns true if pushed. */
export async function commitAndPush(
  agentId: string,
  message: string,
  options?: { authorName?: string; authorEmail?: string },
): Promise<boolean> {
  assertReady(agentId);
  const token = getToken();
  const dir = getMemoryRepoDir(agentId);

  const status = await runGit(dir, ["status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return false;
  }

  await runGit(dir, ["add", "-A"]);

  const author = options?.authorName ?? `letta-cowork (${agentId})`;
  const email =
    options?.authorEmail ?? `letta-cowork+${agentId}@verivolt.com`;

  await runGit(dir, [
    "-c",
    `user.name=${author}`,
    "-c",
    `user.email=${email}`,
    "commit",
    "-m",
    message,
  ]);

  await runGit(dir, ["push"], token);
  return true;
}

/** Working-tree status (mirrors letta-code's getMemoryGitStatus). */
export async function getMemoryGitStatus(
  agentId: string,
): Promise<{ dirty: boolean; aheadOfRemote: boolean; summary: string }> {
  const dir = getMemoryRepoDir(agentId);
  const { stdout: statusOut } = await runGit(dir, ["status", "--porcelain"]);
  const dirty = statusOut.trim().length > 0;

  let aheadOfRemote = false;
  try {
    const { stdout } = await runGit(dir, [
      "rev-list",
      "--count",
      "@{u}..HEAD",
    ]);
    aheadOfRemote = parseInt(stdout.trim(), 10) > 0;
  } catch {
    // No upstream configured or other transient failure.
  }

  const parts: string[] = [];
  if (dirty) {
    const changed = statusOut
      .trim()
      .split("\n")
      .filter((l) => l.trim()).length;
    parts.push(`${changed} uncommitted change(s)`);
  }
  if (aheadOfRemote) parts.push("local commits not pushed to remote");

  return {
    dirty,
    aheadOfRemote,
    summary: parts.length > 0 ? parts.join(", ") : "clean",
  };
}

export interface MemoryFileMeta {
  path: string;
  description?: string;
  preview: string;
  category: "system" | "reference" | "other";
}

/**
 * Walk the checkout and return metadata for every .md file.
 *
 * Ensures the repo is cloned/up-to-date first.
 */
export async function listFiles(agentId: string): Promise<MemoryFileMeta[]> {
  const root = await ensureCheckout(agentId);
  const results: MemoryFileMeta[] = [];

  const walk = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const rel = relative(root, abs).replace(/\\/g, "/");
      const content = await fs.readFile(abs, "utf8");
      const descMatch = content.match(
        /^---[\s\S]*?^description:\s*(.+)$[\s\S]*?^---/m,
      );
      const body = content.replace(/^---[\s\S]*?---\s*/m, "").trim();

      const category: MemoryFileMeta["category"] = rel.startsWith("system/")
        ? "system"
        : rel.startsWith("reference/")
          ? "reference"
          : "other";

      results.push({
        path: rel,
        description: descMatch?.[1]?.trim(),
        preview: body.slice(0, 280),
        category,
      });
    }
  };

  await walk(root);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readMemoryFile(
  agentId: string,
  relativePath: string,
): Promise<string> {
  const root = await ensureCheckout(agentId);
  return fs.readFile(safeJoin(root, relativePath), "utf8");
}

/**
 * Write a memory file by repo-relative path. Creates directories as
 * needed. Does NOT commit or push — call commitAndPush() to publish.
 */
export async function writeMemoryFile(
  agentId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const root = await ensureCheckout(agentId);
  const abs = safeJoin(root, relativePath);
  await fs.mkdir(dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
}
