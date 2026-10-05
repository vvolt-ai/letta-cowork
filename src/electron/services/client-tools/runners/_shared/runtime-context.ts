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

import { AsyncLocalStorage } from "node:async_hooks";
import { statSync } from "node:fs";
import { homedir } from "node:os";

export type RuntimePermissionMode =
    | "default"
    | "acceptEdits"
    | "plan"
    | "memory"
    | "bypassPermissions";

export interface RuntimeContextSnapshot {
    organizationId?: string;
    userId?: string;
    lettaConnectionId?: string;
    agentId?: string | null;
    conversationId?: string | null;
    workingDirectory?: string | null;
    /** Original cwd when a missing working directory was repaired mid-turn. */
    workingDirectoryRecoveredFrom?: string | null;
    permissionMode?: RuntimePermissionMode;
}

const runtimeContextStorage = new AsyncLocalStorage<RuntimeContextSnapshot>();

/** Each invocation owns its mutable snapshot; nested calls inherit explicitly. */
export function runWithRuntimeContext<T>(snapshot: RuntimeContextSnapshot, fn: () => T): T {
    return runtimeContextStorage.run({ ...snapshot }, fn);
}

export function setRuntimeContext(
    snapshot: RuntimeContextSnapshot | undefined
): void {
    // Compatibility setter is local to the current async chain, never process-global.
    runtimeContextStorage.enterWith({ ...snapshot });
}

export function getRuntimeContext(): RuntimeContextSnapshot | undefined {
    return runtimeContextStorage.getStore();
}

export function isUsableDirectory(dirPath: string | null | undefined): boolean {
    if (typeof dirPath !== "string" || dirPath.length === 0) {
        return false;
    }
    try {
        return statSync(dirPath, { throwIfNoEntry: false })?.isDirectory() ?? false;
    } catch {
        return false;
    }
}

function getProcessWorkingDirectory(): string | null {
    try {
        return process.cwd();
    } catch {
        return null;
    }
}

function getFallbackWorkingDirectory(): string {
    const fallback = [
        process.env.USER_CWD,
        getProcessWorkingDirectory(),
        homedir(),
        process.env.USERPROFILE,
        process.platform === "win32" ? undefined : "/",
    ].find(isUsableDirectory);

    if (fallback) return fallback;
    return process.platform === "win32" ? "C:\\" : "/";
}

export function getCurrentWorkingDirectory(): string {
    const activeSnapshot = getRuntimeContext();
    const fromCtx = activeSnapshot?.workingDirectory;
    if (fromCtx && typeof fromCtx === "string" && isUsableDirectory(fromCtx)) {
        return fromCtx;
    }

    const fallback = getFallbackWorkingDirectory();
    if (
        activeSnapshot &&
        typeof fromCtx === "string" &&
        fromCtx.length > 0 &&
        fromCtx !== fallback
    ) {
        activeSnapshot.workingDirectory = fallback;
        activeSnapshot.workingDirectoryRecoveredFrom = fromCtx;
    }
    return fallback;
}

export function consumeWorkingDirectoryRecovery(): string | null {
    const activeSnapshot = getRuntimeContext();
    const recoveredFrom = activeSnapshot?.workingDirectoryRecoveredFrom;
    if (!activeSnapshot || !recoveredFrom) return null;
    activeSnapshot.workingDirectoryRecoveredFrom = null;
    return recoveredFrom;
}

export function getCurrentAgentId(): string | null {
    return (
        getRuntimeContext()?.agentId ??
        process.env.LETTA_AGENT_ID ??
        process.env.AGENT_ID ??
        null
    );
}

export function getCurrentConversationId(): string | null {
    return (
        getRuntimeContext()?.conversationId ??
        process.env.LETTA_CONVERSATION_ID ??
        process.env.CONVERSATION_ID ??
        null
    );
}

export function getPermissionMode(): RuntimePermissionMode {
    return getRuntimeContext()?.permissionMode ?? "default";
}
