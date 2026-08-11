import { promises as fs } from "fs";
import { homedir } from "os";
import { join, relative } from "path";

import {
    ensureCheckout,
} from "./memfs/memfsGit.js";
import { getCurrentAgentId } from "../libs/runner/index.js";

export interface MemoryFileResult {
    path: string;
    description?: string;
    preview: string;
    category: "system" | "reference" | "other";
}

/**
 * List all memory files for the current agent.
 *
 * Walks the memory directory recursively and returns metadata for each
 * .md file. If the active agent's memory repo has never been cloned on
 * this machine, this transparently clones it first (matching the
 * behavior of `letta memfs pull`). For agents that already have a
 * checkout, it performs a fast-forward pull so the listing reflects
 * the latest server state.
 *
 * Falls back to a plain directory walk when:
 *   - MEMORY_DIR is set explicitly (caller wants a specific path)
 *   - The active agent ID isn't a real Letta agent UUID
 *   - LETTA_API_KEY isn't configured (can't talk to the git remote)
 */
export async function listAgentMemoryFiles(): Promise<MemoryFileResult[]> {
    const resolvedAgentId = getCurrentAgentId() || process.env.LETTA_AGENT_ID;
    const explicitDir = process.env.MEMORY_DIR;

    // Try the git-backed path first when we have a real agent id and a
    // token. ensureCheckout returns the local memory dir.
    if (!explicitDir && resolvedAgentId && /^agent-[a-f0-9-]{36}$/i.test(resolvedAgentId) && (process.env.LETTA_API_KEY || "").trim()) {
        try {
            const dir = await ensureCheckout(resolvedAgentId);
            return await walkMemoryDir(dir);
        } catch (err) {
            console.warn(
                `[memoryService] ensureCheckout failed for ${resolvedAgentId}, falling back to plain walk:`,
                err instanceof Error ? err.message : err,
            );
            // Fall through to plain-walk path below.
        }
    }

    const memoryDir = explicitDir
        || (resolvedAgentId ? join(homedir(), ".letta", "agents", resolvedAgentId, "memory") : "");

    if (!memoryDir) {
        throw new Error("Unable to resolve agent memory directory: no MEMORY_DIR and no active agent ID.");
    }

    try {
        await fs.access(memoryDir);
    } catch {
        throw new Error(`Agent memory directory is not accessible: ${memoryDir}${resolvedAgentId ? ` (agent: ${resolvedAgentId})` : ""}`);
    }

    return walkMemoryDir(memoryDir);
}

async function walkMemoryDir(memoryDir: string): Promise<MemoryFileResult[]> {
    const results: MemoryFileResult[] = [];

    const walk = async (currentDir: string) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue;
            const absolutePath = join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(absolutePath);
                continue;
            }
            if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

            const relativePath = relative(memoryDir, absolutePath).replace(/\\/g, "/");
            const content = await fs.readFile(absolutePath, "utf8");
            const descriptionMatch = content.match(/^---[\s\S]*?^description:\s*(.+)$[\s\S]*?^---/m);
            const body = content.replace(/^---[\s\S]*?---\s*/m, "").trim();
            const preview = body.slice(0, 280);
            const category = relativePath.startsWith("system/")
                ? "system"
                : relativePath.startsWith("reference/")
                    ? "reference"
                    : "other";

            results.push({
                path: relativePath,
                description: descriptionMatch?.[1]?.trim(),
                preview,
                category,
            });
        }
    };

    await walk(memoryDir);
    return results.sort((a, b) => a.path.localeCompare(b.path));
}

// Re-export the lower-level git API so callers (other services or IPC
// handlers) can use clone/pull/read/write/commit without reaching into
// the memfs/ folder directly.
export {
    cloneMemoryRepo,
    pullMemory,
    ensureCheckout,
    ensureCheckoutForSession,
    commitAndPush,
    getMemoryGitStatus,
    listFiles as listMemoryFiles,
    readMemoryFile,
    writeMemoryFile,
    getMemoryRepoDir,
    isGitRepo,
    type MemoryFileMeta,
} from "./memfs/memfsGit.js";
