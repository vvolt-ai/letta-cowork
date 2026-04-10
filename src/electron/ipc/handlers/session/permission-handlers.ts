/**
 * Permission handling
 * Handles permission requests and responses
 */

import { getSession } from "../../../libs/runtime-state.js";
import { getStoredSessions } from "../../../services/settings/index.js";
import { getAgentRunApprovalCandidates, cancelAgentRunById, approveRunById } from "../../../services/agents/index.js";
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

        if (candidates.length === 0) return [];

        console.log(`[recoverPendingApprovals] Found ${candidates.length} stuck run(s) for session ${sessionId} — auto-approving`);

        // Notify the UI that we are auto-resolving stuck runs
        emit({
            type: "session.status",
            payload: {
                sessionId,
                status: "running",
                agentId: resolvedAgentId,
            },
        });

        // Auto-approve each stuck run so the session is unblocked on resume.
        // The approveRunById function tries the known Letta approval endpoints
        // and falls back to cancel if none succeed.
        const results = await Promise.allSettled(
            candidates.map((candidate) =>
                approveRunById(candidate.runId)
                    .then((res) => {
                        console.log(`[recoverPendingApprovals] Run ${candidate.runId} resolved via ${res.method}`);
                        return res;
                    })
                    .catch((err) => {
                        console.warn(`[recoverPendingApprovals] Failed to approve run ${candidate.runId}:`, err);
                        // Last-resort cancel
                        return cancelAgentRunById(candidate.runId).catch(() => null);
                    })
            )
        );

        console.log(`[recoverPendingApprovals] All ${results.length} stuck run(s) resolved for session ${sessionId}`);

        // Mark session idle so the UI shows it as ready for new messages
        emit({
            type: "session.status",
            payload: {
                sessionId,
                status: "idle",
                agentId: resolvedAgentId,
            },
        });

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
