/**
 * Type definitions for session IPC handlers
 */

import type { BrowserWindow } from "electron";
import type { RunnerHandle } from "../../../libs/runner/index.js";
import type { PendingPermission } from "../../../libs/runtime-state.js";

/**
 * Context shared across session handlers
 */
export interface SessionIpcContext {
    runnerHandles: Map<string, RunnerHandle>;
    broadcast: (event: ServerEvent) => void;
}

/**
 * Server event types
 */
export interface ServerEvent {
    type: string;
    payload: Record<string, unknown>;
}

/**
 * Message batch for history retrieval
 */
export interface MessageBatch {
    messages: unknown[];
    hasMore: boolean;
    nextBefore?: string;
    totalFetchedCount: number;
    totalDisplayableCount: number;
    allFiltered: unknown[];
}

/**
 * Session creation options
 */
export interface SessionStartOptions {
    prompt?: string;
    content?: unknown;
    attachments?: unknown[];
    cwd?: string;
    agentId?: string;
    model?: string;
    title?: string;
    background?: boolean;
    isEmailSession?: boolean;
}

/**
 * Session continuation options
 */
export interface SessionContinueOptions {
    sessionId: string;
    prompt?: string;
    content?: unknown;
    attachments?: unknown[];
    cwd?: string;
    model?: string;
}

/**
 * Runner handle with abort capability
 */
export type { RunnerHandle };

/**
 * Pending permission type
 */
export type { PendingPermission };
