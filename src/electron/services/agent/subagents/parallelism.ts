/**
 * Resource-aware parallel execution scheduler for subagent tool batches.
 *
 * Mirrors letta-code's src/agent/approval-execution.ts strategy: tools
 * with no side-effect contention run fully in parallel; tools that mutate
 * the same file are serialized within a resource-key group while groups
 * still run in parallel across each other; tools with arbitrary side
 * effects (Bash, memory, apply_patch) hold a global lock so they never
 * race with any other write.
 *
 * Why we can't use plain Promise.all: a subagent turn that fires
 *   Edit({file_path: "foo.ts"})  +  Edit({file_path: "foo.ts"})
 * concurrently would race on the file. Likewise two Bash calls that
 * touch shared state. Upstream solved this with resource-keyed groups;
 * we ported the same model.
 *
 * Why we can't just serialize everything: a subagent turn that fires
 *   Read(a.ts)  +  Read(b.ts)  +  Grep(...)
 * should fan out — that's the whole reason subagents exist. Read-only
 * tools have no contention.
 */

import path from "node:path";

/**
 * Read-only / side-effect-free tools. These can run fully concurrently
 * with anything else, including each other and write tools targeting
 * unrelated resources.
 *
 * Kept in sync with letta-code's PARALLEL_SAFE_TOOLS list. Includes
 * Anthropic, Codex, and Gemini toolset name variants so the same
 * scheduler works regardless of which toolset the spawned agent uses.
 */
const PARALLEL_SAFE_TOOLS = new Set<string>([
    // === Anthropic toolset (default) ===
    "Read",
    "view_image",
    "ViewImage",
    "Grep",
    "Glob",
    // === Codex / OpenAI toolset ===
    "read_file",
    "list_dir",
    "grep_files",
    "ReadFile",
    "ListDir",
    "GrepFiles",
    // === Gemini toolset ===
    "read_file_gemini",
    "list_directory",
    "glob_gemini",
    "search_file_content",
    "read_many_files",
    "ReadFileGemini",
    "ListDirectory",
    "GlobGemini",
    "SearchFileContent",
    "ReadManyFiles",
    // === Cross-toolset / external ===
    "conversation_search",
    "web_search",
    "fetch_webpage",
    "TaskOutput",
    // Task spawns its own scheduler downstream — safe to run multiple
    // sibling Task calls concurrently.
    "Task",
    "Agent",
    // Plan-mode markers have no side effects.
    "EnterPlanMode",
    "ExitPlanMode",
]);

/**
 * Single-file mutators. Two calls targeting the SAME file_path are
 * serialized; two calls on DIFFERENT files run in parallel.
 */
const FILE_PATH_TOOLS = new Set<string>([
    "Edit",
    "Write",
    "MultiEdit",
    "replace",
    "write_file_gemini",
    "Replace",
    "WriteFileGemini",
]);

/**
 * Global-lock tools — anything with potentially arbitrary side effects.
 * These hold the "__global__" key, so they serialize with every other
 * write tool. Reads against the file system can still run concurrently
 * because PARALLEL_SAFE_TOOLS short-circuits the key lookup.
 */
const GLOBAL_LOCK_TOOLS = new Set<string>([
    "Bash",
    "KillBash",
    "run_shell_command",
    "RunShellCommand",
    "shell_command",
    "shell",
    "ShellCommand",
    "Shell",
    "memory",
    "apply_patch",
    "ApplyPatch",
]);

export function isParallelSafe(toolName: string): boolean {
    return PARALLEL_SAFE_TOOLS.has(toolName);
}

/**
 * Compute the lock key for a non-parallel-safe tool. Calls that share
 * a key run sequentially relative to each other; calls with different
 * keys run in parallel.
 *
 * `workingDirectory` is used to normalize relative file_path args so
 * `./src/foo.ts` and `/abs/path/src/foo.ts` hash to the same key when
 * they resolve to the same file.
 */
export function getResourceKey(
    toolName: string,
    toolArgs: Record<string, unknown>,
    workingDirectory: string = process.cwd()
): string {
    if (GLOBAL_LOCK_TOOLS.has(toolName)) return "__global__";

    if (FILE_PATH_TOOLS.has(toolName)) {
        const filePath = toolArgs.file_path;
        if (typeof filePath === "string" && filePath.length > 0) {
            return path.isAbsolute(filePath)
                ? path.normalize(filePath)
                : path.resolve(workingDirectory, filePath);
        }
    }

    // Unknown tool, or write tool missing its file_path arg: fall back
    // to global lock so we never silently race.
    return "__global__";
}

/**
 * Resource-aware parallel scheduler.
 *
 * Given a batch of work items where each item carries a tool name and
 * an args object, runs them concurrently subject to these constraints:
 *   - parallel-safe items run fully in parallel
 *   - same-resource-key items run sequentially within their group
 *   - different-resource-key groups run in parallel
 *
 * The returned array preserves input order: `results[i]` is the result
 * of `items[i]`, regardless of execution interleaving.
 */
export async function runWithResourceLocks<TItem, TResult>(
    items: TItem[],
    getToolName: (item: TItem) => string,
    getArgs: (item: TItem) => Record<string, unknown>,
    execute: (item: TItem, index: number) => Promise<TResult>,
    workingDirectory?: string
): Promise<TResult[]> {
    const results = new Array<TResult | undefined>(items.length);

    const parallelIndices: number[] = [];
    const byResource = new Map<string, number[]>();

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item === undefined) continue;
        const toolName = getToolName(item);

        if (isParallelSafe(toolName)) {
            parallelIndices.push(i);
            continue;
        }

        const key = getResourceKey(toolName, getArgs(item), workingDirectory);
        const bucket = byResource.get(key) ?? [];
        bucket.push(i);
        byResource.set(key, bucket);
    }

    const runOne = async (i: number) => {
        const item = items[i];
        if (item === undefined) return;
        results[i] = await execute(item, i);
    };

    await Promise.all([
        ...parallelIndices.map(runOne),
        ...Array.from(byResource.values()).map(async (group) => {
            for (const i of group) {
                await runOne(i);
            }
        }),
    ]);

    return results as TResult[];
}
