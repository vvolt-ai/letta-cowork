/**
 * Session IPC handlers - Main entry point
 * Handles session lifecycle events: start, stop, continue, delete, list, history
 */

import { handleAbortSession, handleAbortAllSessions } from "./abort-handlers.js";
import { handleGetSessionHistory } from "./history-handler.js";
import { handlePermissionResult, recoverPendingApprovalsForSession, cancelRecoveredRun } from "./permission-handlers.js";
import { handleStartSession } from "./session-creation.js";
import {
    handleStopSession,
    handleDeleteSession,
    handleListSessions,
    handleCancelPending,
    handleRenameSession,
    cleanupAllSessions,
} from "./session-lifecycle.js";
import { handleContinueSession } from "./session-resumption.js";
import { debug } from "./utils.js";

import type { ClientEvent } from "../../../types.js";
import type { CanUseToolResponse } from "@letta-ai/letta-agent-sdk";

// Re-export for external use
export { cleanupAllSessions, recoverPendingApprovalsForSession, cancelRecoveredRun };

/**
 * Handle session-related client events
 */
export async function handleSessionEvent(event: ClientEvent): Promise<void> {
    debug(`handleClientEvent: ${event.type}`, { payload: "payload" in event ? event.payload : undefined });

    if (event.type === "session.list") {
        handleListSessions();
        return;
    }

    if (event.type === "session.history") {
        const { sessionId, limit, before } = event.payload as { sessionId: string; limit?: number; before?: string };
        await handleGetSessionHistory(sessionId, limit, before);
        return;
    }

    if (event.type === "session.start") {
        await handleStartSession(event.payload as Parameters<typeof handleStartSession>[0]);
        return;
    }

    if (event.type === "session.continue") {
        await handleContinueSession(event.payload as Parameters<typeof handleContinueSession>[0]);
        return;
    }

    if (event.type === "session.stopAndContinue") {
        const payload = event.payload as Parameters<typeof handleContinueSession>[0];
        await handleStopSession(payload.sessionId);
        await handleContinueSession(payload);
        return;
    }

    if (event.type === "session.stop") {
        const { sessionId } = event.payload as { sessionId: string };
        await handleStopSession(sessionId);
        return;
    }

    if (event.type === "session.delete") {
        const { sessionId } = event.payload as { sessionId: string };
        await handleDeleteSession(sessionId);
        return;
    }

    if (event.type === "session.cancelPending") {
        await handleCancelPending();
        return;
    }

    if (event.type === "session.rename") {
        const { sessionId, title } = event.payload as { sessionId: string; title: string };
        handleRenameSession(sessionId, title);
        return;
    }

    if (event.type === "permission.response") {
        const { sessionId, toolUseId, result, scope } = event.payload as {
            sessionId: string;
            toolUseId: string;
            result: CanUseToolResponse;
            scope?: "once" | "tool" | "session";
        };
        handlePermissionResult(sessionId, toolUseId, result, scope);
        return;
    }

    if (event.type === "session.abort") {
        const { sessionId } = event.payload as { sessionId: string };
        await handleAbortSession(sessionId);
        return;
    }

    if (event.type === "session.abortAll") {
        await handleAbortAllSessions();
        return;
    }
}
