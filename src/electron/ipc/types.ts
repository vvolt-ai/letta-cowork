/**
 * Shared types for IPC handlers
 */

import type { BrowserWindow } from "electron";
import type { RunnerHandle } from "../libs/runner/index.js";
import type { PendingPermission } from "../libs/runtime-state.js";
import type { ServerEvent } from "../types.js";

/**
 * Session runtime state
 */
export interface SessionRuntime {
    id: string;
    title?: string;
    status: "idle" | "running" | "completed" | "error";
    cwd?: string;
    pendingPermissions: Map<string, PendingPermission>;
    agentId?: string;
}

/**
 * Runner handle with session association
 */
export interface SessionRunnerHandle extends RunnerHandle {
    sessionId: string;
}

/**
 * Logger function type
 */
export type LoggerFunction = (msg: string, data?: Record<string, unknown>) => void;

/**
 * Broadcast function type
 */
export type BroadcastFunction = (event: ServerEvent) => void;

/**
 * Letta client factory type
 */
export type LettaClientFactory = () => import("@letta-ai/letta-client").Letta | null;

/**
 * IPC handler context - shared dependencies for handlers
 */
export interface IpcHandlerContext {
    getMainWindow: () => BrowserWindow | null;
    broadcast: BroadcastFunction;
    getRunnerHandle: (sessionId: string) => RunnerHandle | undefined;
    setRunnerHandle: (sessionId: string, handle: RunnerHandle) => void;
    deleteRunnerHandle: (sessionId: string) => void;
}
