/**
 * Approval recovery — discover and clear pending tool approvals on a
 * conversation that's stuck in `requires_approval`.
 *
 * Mirrors letta-code's canonical pattern (src/agent/check-approval.ts +
 * src/agent/turn-recovery-policy.ts in @letta-ai/letta-code). The
 * source of truth is `conversation.in_context_message_ids` — NOT
 * `runs.list({status: requires_approval})`. Reasons:
 *   - One round trip to discover instead of N+1 (list runs, then
 *     walk each run's messages).
 *   - Immune to stale runs left behind by earlier sessions on the
 *     same agent. We only ever touch approvals that are blocking
 *     RIGHT NOW on this exact conversation.
 *   - Cross-references `tool_return_message` /
 *     `approval_response_message` variants to drop calls that are
 *     already resolved, so we never submit denials with invalid
 *     tool_call_ids (which produce a different 409 and would defeat
 *     recovery).
 *
 * The clearance loop is `while (true)` — cascading parallel
 * approvals can surface a fresh `approval_request_message` after we
 * deny the first batch, so we re-fetch until the conversation is
 * actually clean before letting the next user turn fly.
 */

import { randomUUID } from "node:crypto";
import type { Letta } from "@letta-ai/letta-client";
import type { Message } from "@letta-ai/letta-client/resources/agents/messages";
import { debug } from "../../libs/runner/logger.js";

export interface PendingApproval {
    toolCallId: string;
    toolName: string;
    toolArgs: string;
}

export const STALE_APPROVAL_RECOVERY_DENIAL_REASON =
    "Auto-denied: stale approval from interrupted session";

// ── Discovery ──────────────────────────────────────────────────────

type ApprovalRequestMessage = Message & {
    tool_calls?: Array<{
        tool_call_id?: string;
        name?: string;
        arguments?: string;
    }> | null;
    tool_call?: {
        tool_call_id?: string;
        name?: string;
        arguments?: string;
    };
};

type ToolReturnMessage = Message & {
    tool_call_id?: string;
    tool_returns?: Array<{ tool_call_id?: string }>;
};

type ApprovalResponseMessage = Message & {
    approvals?: Array<{ tool_call_id?: string }>;
};

function approvalRequestsFromMessage(message: Message): PendingApproval[] {
    const m = message as ApprovalRequestMessage;
    const toolCalls = Array.isArray(m.tool_calls)
        ? m.tool_calls
        : m.tool_call
          ? [m.tool_call]
          : [];

    return toolCalls
        .filter(
            (tc): tc is { tool_call_id: string; name?: string; arguments?: string } =>
                !!tc && typeof tc.tool_call_id === "string"
        )
        .map((tc) => ({
            toolCallId: tc.tool_call_id,
            toolName: tc.name ?? "",
            toolArgs: tc.arguments ?? "",
        }));
}

function completedToolCallIds(messages: Message[]): Set<string> {
    const completed = new Set<string>();
    for (const message of messages) {
        if (message.message_type === "tool_return_message") {
            const tr = message as ToolReturnMessage;
            if (typeof tr.tool_call_id === "string") {
                completed.add(tr.tool_call_id);
            }
            for (const ret of tr.tool_returns ?? []) {
                if (typeof ret.tool_call_id === "string") {
                    completed.add(ret.tool_call_id);
                }
            }
            continue;
        }
        if (message.message_type === "approval_response_message") {
            const ar = message as ApprovalResponseMessage;
            for (const a of ar.approvals ?? []) {
                if (typeof a.tool_call_id === "string") {
                    completed.add(a.tool_call_id);
                }
            }
        }
    }
    return completed;
}

/**
 * Discover pending approvals blocking `conversationId` right now.
 * Returns [] if the conversation is clean.
 *
 * Algorithm (mirrors letta-code/check-approval.ts):
 *   1. Fetch the conversation; the LAST id in `in_context_message_ids`
 *      is the message currently in the agent's context tail.
 *   2. Retrieve all variants of that message id (server returns
 *      multiple rows: the LLM response, the approval_request_message
 *      variant if any, etc.).
 *   3. Find the `approval_request_message` variant.
 *   4. Cross-reference against tool_return / approval_response
 *      variants on the same id to drop tool_call_ids that are
 *      already resolved.
 */
export async function discoverPendingApprovals(
    client: Letta,
    conversationId: string
): Promise<PendingApproval[]> {
    const conversation = await client.conversations.retrieve(conversationId);
    const inContextIds = conversation.in_context_message_ids;
    if (!inContextIds || inContextIds.length === 0) return [];

    const lastId = inContextIds[inContextIds.length - 1];
    if (!lastId) return [];

    const variants = (await client.messages.retrieve(lastId)) as Message[];
    const approvalRequest = variants.find(
        (v) => v.message_type === "approval_request_message"
    );
    if (!approvalRequest) return [];

    const completed = completedToolCallIds(variants);
    return approvalRequestsFromMessage(approvalRequest).filter(
        (a) => !completed.has(a.toolCallId)
    );
}

// ── Clearance ──────────────────────────────────────────────────────

const MAX_CLEAR_ITERATIONS = 5;
const APPROVAL_DRAIN_TIMEOUT_MS = 15_000;
const FAST_APPROVAL_DRAIN_TIMEOUT_MS = 2_000;
const APPROVAL_DRAIN_TIMEOUT = Symbol("approval-drain-timeout");

async function drainApprovalStreamWithTimeout(
    stream: AsyncIterable<unknown>,
    timeoutMs = APPROVAL_DRAIN_TIMEOUT_MS
): Promise<"completed" | "timed_out"> {
    const iterator = stream[Symbol.asyncIterator]();
    const deadline = Date.now() + timeoutMs;

    while (true) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            void Promise.resolve(iterator.return?.()).catch(() => undefined);
            return "timed_out";
        }

        const timeout = new Promise<typeof APPROVAL_DRAIN_TIMEOUT>((resolve) => {
            setTimeout(() => resolve(APPROVAL_DRAIN_TIMEOUT), remainingMs);
        });

        const next = await Promise.race([iterator.next(), timeout]);
        if (next === APPROVAL_DRAIN_TIMEOUT) {
            void Promise.resolve(iterator.return?.()).catch(() => undefined);
            return "timed_out";
        }
        if (next.done) return "completed";
    }
}

/**
 * Loop until the conversation has zero pending approvals (or the
 * iteration cap is hit). On each iteration: discover → submit a
 * batch of denials → drain the resulting stream → re-discover.
 *
 * Submits via `conversations.messages.create` with a payload of
 * shape `{type:'approval', approvals:[{tool_call_id, approve:false,
 * reason}], otid}`. Same primitive the in-stream auto-deny path uses
 * successfully. A fresh OTID is generated per attempt so the server
 * doesn't dedupe a retry as an already-seen request.
 *
 * Best-effort. Failures are logged but do not throw — the caller
 * (typically pre-flight before a user send) will surface a clearer
 * error if the conflict still persists on the next messages.create.
 */
export async function clearPendingApprovals(
    client: Letta,
    conversationId: string,
    options: { drainTimeoutMs?: number } = {}
): Promise<{ iterations: number; cleared: number }> {
    let iterations = 0;
    let cleared = 0;
    // Snapshot the set of tool_call_ids we classify as "stale" on the
    // very first discovery. Recovery only ever runs pre-flight (or on
    // an explicit conflict retry), so anything pending at THAT moment
    // is legitimately stale. New tool_call_ids that surface in later
    // iterations are post-denial cascades from the agent processing
    // our denials — they belong to the live turn and MUST NOT be
    // denied. Bounding by this snapshot prevents the recovery loop
    // from trampling fresh tool calls.
    let staleSnapshot: Set<string> | null = null;
    const drainTimeoutMs = options.drainTimeoutMs ?? FAST_APPROVAL_DRAIN_TIMEOUT_MS;

    while (iterations < MAX_CLEAR_ITERATIONS) {
        iterations += 1;

        let pending: PendingApproval[];
        try {
            pending = await discoverPendingApprovals(client, conversationId);
        } catch (err) {
            debug("clearPendingApprovals: discovery failed", {
                conversationId,
                iteration: iterations,
                error: err instanceof Error ? err.message : String(err),
            });
            break;
        }

        if (staleSnapshot === null) {
            staleSnapshot = new Set(pending.map((p) => p.toolCallId));
        } else {
            // Drop anything that wasn't in the original stale set.
            pending = pending.filter((p) => staleSnapshot!.has(p.toolCallId));
        }

        if (pending.length === 0) {
            debug("clearPendingApprovals: clean", {
                conversationId,
                iterations,
                cleared,
            });
            break;
        }

        debug("clearPendingApprovals: submitting denials", {
            conversationId,
            iteration: iterations,
            toolCallIds: pending.map((p) => p.toolCallId),
        });

        try {
            const stream = (await (
                client as unknown as {
                    conversations: {
                        messages: {
                            create: (
                                convId: string,
                                body: Record<string, unknown>
                            ) => Promise<AsyncIterable<unknown>>;
                        };
                    };
                }
            ).conversations.messages.create(conversationId, {
                messages: [
                    {
                        type: "approval",
                        approvals: pending.map((p) => ({
                            type: "approval" as const,
                            tool_call_id: p.toolCallId,
                            approve: false,
                            reason: STALE_APPROVAL_RECOVERY_DENIAL_REASON,
                        })),
                        otid: randomUUID(),
                    },
                ],
            })) as AsyncIterable<unknown>;

            // Drain. The agent may emit a follow-up turn after the
            // denial lands (assistant ack, end_turn). We discard it —
            // recovery only needs the rejection to commit server-side.
            // Bound the wait: stale-approval recovery is pre-flight and
            // must never hold the user's next turn hostage if the SSE
            // drain hangs after the denial has been accepted.
            try {
                const drainResult = await drainApprovalStreamWithTimeout(stream, drainTimeoutMs);
                if (drainResult === "timed_out") {
                    debug("clearPendingApprovals: drain timed out (non-fatal)", {
                        conversationId,
                        iteration: iterations,
                        timeoutMs: drainTimeoutMs,
                        toolCallIds: pending.map((p) => p.toolCallId),
                    });
                }
            } catch (drainErr) {
                debug("clearPendingApprovals: drain error (non-fatal)", {
                    conversationId,
                    iteration: iterations,
                    error:
                        drainErr instanceof Error
                            ? drainErr.message
                            : String(drainErr),
                });
            }

            cleared += pending.length;
        } catch (err) {
            console.warn(
                `[clearPendingApprovals] denial submit failed (iteration ${iterations}):`,
                err instanceof Error ? err.message : String(err)
            );
            break;
        }
    }

    if (iterations >= MAX_CLEAR_ITERATIONS) {
        console.warn(
            `[clearPendingApprovals] hit iteration cap (${MAX_CLEAR_ITERATIONS}) on ${conversationId} — conversation may still have pending approvals`
        );
    }

    return { iterations, cleared };
}
