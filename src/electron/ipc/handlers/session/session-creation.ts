/**
 * Session creation handler
 * Handles starting new sessions
 */

import type { RunnerHandle } from "../../../libs/runner/index.js";
import { runLetta, clearAgentCache } from "../../../libs/runner/index.js";
import type { MessageContentItem } from "@letta-ai/letta-code-sdk";
import type { PendingPermission } from "../../../libs/runtime-state.js";
import { createRuntimeSession, updateSession } from "../../../libs/runtime-state.js";
import type { SessionStatus } from "../../../libs/runtime-state.js";
import { addStoredSession } from "../../../services/settings/index.js";
import { getLettaAgent } from "../../../services/agents/index.js";
import { log, debug, broadcast } from "./utils.js";
import { generateTitleFromPrompt } from "./title-generator.js";
import type { ServerEvent, SessionStartOptions } from "./types.js";
import type { RunnerSession } from "../../../libs/runner/types.js";

// Track active runner handles by real Letta conversation IDs (shared across handlers)
export const runnerHandles = new Map<string, RunnerHandle>();

/**
 * Cancel all runners and clear handles
 */
export async function cancelAllRunners(): Promise<void> {
    debug("cancelAllRunners: cancelling all runners", { count: runnerHandles.size });
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
    const { prompt, content, attachments, cwd, agentId, model, title, background, isEmailSession } = options;
    clearAgentCache();

    debug("session.start: starting new session", {
        prompt: (prompt ?? "").slice(0, 50), cwd,
        contentType: Array.isArray(content) ? "multimodal" : "text",
        attachments: attachments?.length ?? 0, background, isEmailSession,
    });

    const pendingPermissions = new Map<string, PendingPermission>();
    const safePrompt = prompt ?? "";
    const safeTitle = (title?.trim() ?? "") || generateTitleFromPrompt(safePrompt);

    try {
        debug("session.start: calling runLetta (waits for real conversation ID)");

        const sessionConfig: RunnerSession = {
            id: "pending", // Will be replaced by real conversation ID
            title: safeTitle,
            status: "running",
            cwd,
            pendingPermissions
        };

        const handle = await runLetta({
            prompt: safePrompt,
            content: content as MessageContentItem[] | undefined,
            preferredAgentId: agentId,
            model,
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

                    createRuntimeSession(conversationId);
                    updateSession(conversationId, { status: "running", title: sessionTitle });

                    const resolvedAgentId = agentId || process.env.LETTA_AGENT_ID || "";
                    let agentName: string | undefined = undefined;
                    try {
                        console.log("[ipc] Getting agent name for agentId:", resolvedAgentId);
                        const agent = await getLettaAgent(resolvedAgentId);
                        console.log("[ipc] Got agent:", agent);
                        if (agent) agentName = agent.name;
                    } catch (e) {
                        console.log("[ipc] Failed to get agent name:", e);
                    }

                    addStoredSession({
                        id: conversationId, agentId: resolvedAgentId, agentName,
                        title: sessionTitle, createdAt: Date.now(), updatedAt: Date.now(),
                        isEmailSession: isEmailSession ?? false,
                    });

                    console.log("[session.start] Emitting session.status", { conversationId, isEmailSession, status: "running" });
                    emit({
                        type: "session.status",
                        payload: { sessionId: conversationId, status: "running", title: sessionTitle, cwd, agentName, agentId: resolvedAgentId, background, isEmailSession },
                    });
                    emit({
                        type: "stream.user_prompt",
                        payload: { sessionId: conversationId, prompt, attachments, content },
                    });
                }
            },
        });

        // runLetta now returns a handle with the real conversation ID
        const conversationId = handle.sessionId;
        runnerHandles.set(conversationId, handle);
        debug("session.start: runLetta returned handle", { conversationId });

    } catch (error) {
        log("session.start: ERROR", { error: String(error) });
        console.error("Failed to start session:", error);
        await cancelAllRunners();
        emit({ type: "runner.error", payload: { message: String(error) } });
    }
}
