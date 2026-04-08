import { homedir } from "os";
import { join, relative } from "path";
import { promises as fs } from "fs";
import { getCurrentAgentId } from "../libs/runner/index.js";

export interface MemoryFileResult {
    path: string;
    description?: string;
    preview: string;
    category: "system" | "reference" | "other";
}

/**
 * List all memory files for the current agent.
 * Walks the memory directory recursively and returns metadata for each .md file.
 */
export async function listAgentMemoryFiles(): Promise<MemoryFileResult[]> {
    const resolvedAgentId = getCurrentAgentId() || process.env.LETTA_AGENT_ID;
    const memoryDir = process.env.MEMORY_DIR
        || (resolvedAgentId ? join(homedir(), ".letta", "agents", resolvedAgentId, "memory") : "");

    if (!memoryDir) {
        throw new Error("Unable to resolve agent memory directory: no MEMORY_DIR and no active agent ID.");
    }

    try {
        await fs.access(memoryDir);
    } catch {
        throw new Error(`Agent memory directory is not accessible: ${memoryDir}${resolvedAgentId ? ` (agent: ${resolvedAgentId})` : ""}`);
    }

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
