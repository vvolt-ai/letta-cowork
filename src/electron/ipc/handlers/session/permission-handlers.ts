/**
 * Permission handling
 * Handles permission requests and responses
 */

import { getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions } from "../../../services/settings/index.js";
import { getAgentRunApprovalCandidates, cancelAgentRunById } from "../../../services/agents/index.js";
import { emit } from "./session-creation.js";
import type { CanUseToolResponse } from "@letta-ai/letta-code-sdk";

/**
 * Handle permission.response event
 */
export function handlePermissionResult(
    sessionId: string,
    toolUseId: string,
    result: CanUseToolResponse
): void {
    const session = getSession(sessionId);
    if (!session) return;

    const pending = session.pendingPermissions.get(toolUseId);
    if (pending) {
        pending.resolve(result);
    }
}

/**
 * Recover pending approvals for a session
 */
export async function recoverPendingApprovalsForSession(
    sessionId: string,
    agentId?: string
): Promise<Array<{
    toolUseId: string;
    toolName: string;
    input: unknown;
    runId: string;
    conversationId: string;
    requestedAt?: string;
}>> {
    const resolvedAgentId = agentId
        || getSession(sessionId)?.agentId
        || getStoredSessions().find((session) => session.id === sessionId)?.agentId;

    if (!resolvedAgentId) return [];

    try {
        const candidates = await getAgentRunApprovalCandidates(resolvedAgentId, sessionId);
        for (const candidate of candidates) {
            emit({
                type: "permission.request",
                payload: {
                    sessionId,
                    toolUseId: candidate.toolUseId,
                    toolName: candidate.toolName,
                    input: candidate.input,
                    source: "recovered",
                    runId: candidate.runId,
                    conversationId: candidate.conversationId,
                    isStuckRun: true,
                    requestedAt: candidate.requestedAt,
                },
            });
        }
        return candidates
            .filter((candidate) => Boolean(candidate.conversationId))
            .map((candidate) => ({
                toolUseId: candidate.toolUseId,
                toolName: candidate.toolName,
                input: candidate.input,
                runId: candidate.runId,
                conversationId: candidate.conversationId as string,
                requestedAt: typeof candidate.requestedAt === "number"
                    ? String(candidate.requestedAt)
                    : candidate.requestedAt,
            }));
    } catch (error) {
        console.warn("Failed to recover pending approvals for session", { sessionId, resolvedAgentId, error });
        return [];
    }
}

/**
 * Cancel a recovered run
 */
export async function cancelRecoveredRun(runId: string): Promise<void> {
    await cancelAgentRunById(runId);
}
