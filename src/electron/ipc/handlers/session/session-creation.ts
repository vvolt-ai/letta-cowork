/**
 * Session creation handler
 * Handles starting new sessions
 */

import { cancelAllQueuedConversationTurns } from "./conversation-turn-queue.js";
import { generateTitleFromPrompt } from "./title-generator.js";
import { log, debug, broadcast } from "./utils.js";
import { runLetta, clearAgentCache, type RunnerHandle } from "../../../libs/runner/index.js";
import {
    createRuntimeSession,
    createSessionPermissionGrants,
    updateSession,
    type PendingPermission,
    type SessionStatus,
} from "../../../libs/runtime-state.js";
import { getLettaAgent } from "../../../services/agents/index.js";
import { addStoredSession, updateStoredSession } from "../../../services/settings/index.js";

import type { ServerEvent, SessionStartOptions } from "./types.js";
import type { RunnerSession } from "../../../libs/runner/types.js";
import type { MessageContentItem } from "@letta-ai/letta-agent-sdk";


// Track active runner handles by real Letta conversation IDs (shared across handlers)
export const runnerHandles = new Map<string, RunnerHandle>();

export function trackRunnerHandle(
    conversationId: string,
    handle: RunnerHandle
): void {
    runnerHandles.set(conversationId, handle);
    void handle.done.finally(() => {
        if (runnerHandles.get(conversationId) === handle) {
            runnerHandles.delete(conversationId);
        }
    });
}

/**
 * Cancel all runners and clear handles
 */
export async function cancelAllRunners(): Promise<void> {
    debug("cancelAllRunners: cancelling all runners", { count: runnerHandles.size });
    cancelAllQueuedConversationTurns();
    for (const [key, handle] of runnerHandles) {
        try {
            await handle.abort();
        } catch (err) {
            debug("cancelAllRunners: error aborting handle", { key, error: String(err) });
        }
    }
    runnerHandles.clear();
    debug("cancelAllRunners: all runners cancelled");
}

/**
 * Emit event to all windows and update runtime state
 */
export function emit(event: ServerEvent): void {
    if (event.type === "session.status") {
        const payload = event.payload as { sessionId: string; status: SessionStatus };
        updateSession(payload.sessionId, { status: payload.status });
    }
    broadcast(event);
}

/**
 * Handle session.start event
 * Waits for a real Letta conversation ID before creating/exposing the session.
 */
export async function handleStartSession(
    options: SessionStartOptions
): Promise<void> {
    const { prompt, content, attachments, cwd, agentId, model, permissionMode, title, background, isEmailSession } = options;
    clearAgentCache();

    debug("session.start: starting new session", {
        prompt: (prompt ?? "").slice(0, 50), cwd,
        contentType: Array.isArray(content) ? "multimodal" : "text",
        attachments: attachments?.length ?? 0, background, isEmailSession,
    });

    const pendingPermissions = new Map<string, PendingPermission>();
    const permissionGrants = createSessionPermissionGrants();
    const safePrompt = prompt ?? "";
    const safeTitle = (title?.trim() ?? "") || generateTitleFromPrompt(safePrompt);

    try {
        debug("session.start: calling runLetta (waits for real conversation ID)");

        const sessionConfig: RunnerSession = {
            id: "pending", // Will be replaced by real conversation ID
            title: safeTitle,
            status: "running",
            cwd,
            pendingPermissions,
            permissionGrants,
        };

        const handle = await runLetta({
            prompt: safePrompt,
            content: content as MessageContentItem[] | undefined,
            preferredAgentId: agentId,
            model,
            permissionMode,
            session: sessionConfig,
            onEvent: (e) => {
                // All events now should have the real conversation ID
                emit(e);
            },
            onSessionUpdate: async (updates) => {
                debug("session.start: onSessionUpdate called", { updates });
                if (updates.lettaConversationId) {
                    const conversationId = updates.lettaConversationId;
                    debug("session.start: session initialized", { conversationId });

                    const sessionTitle = safeTitle;

                    // Keep the exact permission map captured by canUseTool. Creating a
                    // fresh map here makes approval responses invisible to the waiting
                    // runner and leaves standard-mode sessions stuck forever.
                    createRuntimeSession(
                        conversationId,
                        pendingPermissions,
                        permissionGrants
                    );
                    updateSession(conversationId, { status: "running", title: sessionTitle });

                    const resolvedAgentId = agentId || process.env.LETTA_AGENT_ID || "";
                    addStoredSession({
                        id: conversationId, agentId: resolvedAgentId, agentName: undefined,
                        title: sessionTitle, createdAt: Date.now(), updatedAt: Date.now(),
                        isEmailSession: isEmailSession ?? false,
                    });

                    console.log("[session.start] Emitting session.status", { conversationId, isEmailSession, status: "running" });
                    emit({
                        type: "session.status",
                        payload: { sessionId: conversationId, status: "running", title: sessionTitle, cwd, agentId: resolvedAgentId, background, isEmailSession },
                    });
                    emit({
                        type: "stream.user_prompt",
                        payload: { sessionId: conversationId, prompt, attachments, content },
                    });

                    if (resolvedAgentId) {
                        void getLettaAgent(resolvedAgentId)
                            .then((agent) => {
                                if (!agent?.name) return;
                                updateStoredSession(conversationId, { agentName: agent.name, updatedAt: Date.now() });
                                updateSession(conversationId, { title: sessionTitle });
                                emit({
                                    type: "session.status",
                                    payload: {
                                        sessionId: conversationId,
                                        status: "running",
                                        title: sessionTitle,
                                        cwd,
                                        agentName: agent.name,
                                        agentId: resolvedAgentId,
                                        background,
                                        isEmailSession,
                                    },
                                });
                            })
                            .catch((e) => {
                                console.log("[ipc] Failed to get agent name:", e);
                            });
                    }
                }
            },
        });

        // runLetta now returns a handle with the real conversation ID
        const conversationId = handle.sessionId;
        trackRunnerHandle(conversationId, handle);
        debug("session.start: runLetta returned handle", { conversationId });

    } catch (error) {
        log("session.start: ERROR", { error: String(error) });
        console.error("Failed to start session:", error);
        // runLetta cleans up its own failed initialization. Do not cancel
        // unrelated sessions because one new session failed to start.
        emit({ type: "runner.error", payload: { message: String(error) } });
    }
}
