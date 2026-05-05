/**
 * Slim shim of cowork-gui's runtime-context.ts.
 *
 * cowork-gui uses AsyncLocalStorage to scope per-turn state (agentId,
 * conversationId, working directory, permission mode). letta-cowork
 * passes those through ToolRunContext on each call instead, so we
 * expose the small subset of helpers the tool impls reach for at
 * import time and back them with process.env / process.cwd() defaults.
 *
 * If/when we add an AsyncLocalStorage scope in our session pump, we can
 * widen this without changing the call sites.
 */

export type RuntimePermissionMode =
    | "default"
    | "acceptEdits"
    | "plan"
    | "memory"
    | "bypassPermissions";

export interface RuntimeContextSnapshot {
    agentId?: string | null;
    conversationId?: string | null;
    workingDirectory?: string | null;
    permissionMode?: RuntimePermissionMode;
}

let activeSnapshot: RuntimeContextSnapshot | undefined;

export function setRuntimeContext(
    snapshot: RuntimeContextSnapshot | undefined
): void {
    activeSnapshot = snapshot;
}

export function getRuntimeContext(): RuntimeContextSnapshot | undefined {
    return activeSnapshot;
}

export function getCurrentWorkingDirectory(): string {
    const fromCtx = activeSnapshot?.workingDirectory;
    if (fromCtx && typeof fromCtx === "string" && fromCtx.trim()) {
        return fromCtx;
    }
    return (
        process.env.USER_CWD ||
        process.env.HOME ||
        process.env.USERPROFILE ||
        process.cwd()
    );
}

export function getCurrentAgentId(): string | null {
    return (
        activeSnapshot?.agentId ??
        process.env.LETTA_AGENT_ID ??
        process.env.AGENT_ID ??
        null
    );
}

export function getCurrentConversationId(): string | null {
    return (
        activeSnapshot?.conversationId ??
        process.env.LETTA_CONVERSATION_ID ??
        process.env.CONVERSATION_ID ??
        null
    );
}

export function getPermissionMode(): RuntimePermissionMode {
    return activeSnapshot?.permissionMode ?? "default";
}
