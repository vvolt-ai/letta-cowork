/**
 * No-op stub for letta-code's websocket/listener/worktree-ownership.
 *
 * In letta-code, this module tracks `.letta/worktrees/<branch>/` paths
 * the agent is allowed to write to (subagents get isolated worktrees).
 * letta-cowork doesn't have a worktree subsystem, so the hook is a
 * no-op — preserves the import shape from letta-code's shellRunner.ts
 * verbatim so we can keep the runner's source identical.
 */

export function noteExpectedWorktreeForLauncher(
    _launcher: string[],
    _cwd: string
): void {
    /* no-op */
}
