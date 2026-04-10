/**
 * Session resumption handler
 * Handles continuing existing sessions
 */

import { runLetta } from "../../../libs/runner/index.js";
import type { MessageContentItem } from "@letta-ai/letta-code-sdk";
import { createRuntimeSession, updateSession, deleteSession, getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions } from "../../../services/settings/index.js";
import { log, debug, broadcast } from "./utils.js";
import type { ServerEvent, SessionContinueOptions } from "./types.js";
import { runnerHandles, emit } from "./session-creation.js";

/**
 * Handle session.continue event
 * Only works with real Letta conversation IDs.
 */
export async function handleContinueSession(
    options: SessionContinueOptions
): Promise<void> {
    const { sessionId: conversationId, prompt, content, attachments, cwd, model } = options;

    // Validate we have a real conversation ID
    if (!conversationId || !/^(agent-|conv-|conversation-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.test(conversationId)) {
        log("session.continue: ERROR - invalid conversation ID", { conversationId });
        emit({ type: "session.status", payload: { sessionId: conversationId || "unknown", status: "error", error: "Invalid conversation ID" } });
        return;
    }

    const previewPrompt = (prompt ?? "").slice(0, 50);
    debug("session.continue: continuing session", {
        conversationId, prompt: previewPrompt,
        contentType: Array.isArray(content) ? "multimodal" : "text",
        attachments: attachments?.length ?? 0,
    });

    let runtimeSession = getSession(conversationId);
    if (!runtimeSession) {
        debug("session.continue: no runtime session found, creating new one");
        runtimeSession = createRuntimeSession(conversationId);
    } else {
        debug("session.continue: found existing runtime session", { status: runtimeSession.status });
    }

    const storedSession = runtimeSession.title
        ? undefined
        : getStoredSessions().find((session) => session.id === conversationId);
    const resolvedTitle = runtimeSession.title ?? storedSession?.title ?? conversationId;

    runtimeSession = updateSession(conversationId, { status: "running", title: resolvedTitle }) ?? runtimeSession;

    emit({ type: "session.status", payload: { sessionId: conversationId, status: "running", title: resolvedTitle } });
    emit({ type: "stream.user_prompt", payload: { sessionId: conversationId, prompt, attachments, content } });

    try {
        debug("session.continue: calling runLetta", { conversationId });
        let actualConversationId = conversationId;

        const handle = await runLetta({
            prompt: prompt ?? "",
            content: content as MessageContentItem[] | undefined,
            model,
            session: {
                id: conversationId, title: resolvedTitle, status: "running", cwd,
                pendingPermissions: runtimeSession.pendingPermissions,
            },
            resumeConversationId: conversationId,
            onEvent: (e) => {
                if (actualConversationId !== conversationId && "sessionId" in e.payload) {
                    const payload = e.payload as { sessionId: string };
                    payload.sessionId = actualConversationId;
                }
                emit(e);
            },
            onSessionUpdate: (updates) => {
                if (updates.lettaConversationId && updates.lettaConversationId !== conversationId) {
                    log("session.continue: received new conversationId from runner", { old: conversationId, new: updates.lettaConversationId });
                    actualConversationId = updates.lettaConversationId;

                    deleteSession(conversationId);
                    emit({ type: "session.deleted", payload: { sessionId: conversationId } });

                    createRuntimeSession(actualConversationId);
                    updateSession(actualConversationId, { status: "running" });

                    emit({ type: "session.status", payload: { sessionId: actualConversationId, status: "running", title: actualConversationId, cwd } });
                    emit({ type: "stream.user_prompt", payload: { sessionId: actualConversationId, prompt, attachments, content } });
                }
            },
        });
        debug("session.continue: runLetta returned handle");

        runnerHandles.set(actualConversationId, handle);
    } catch (error) {
        log("session.continue: ERROR", { error: String(error) });
        await Promise.all(Array.from(runnerHandles.values()).map(h => h.abort()));
        runnerHandles.clear();
        updateSession(conversationId, { status: "error" });
        emit({ type: "session.status", payload: { sessionId: conversationId, status: "error", error: String(error) } });
    }
}
