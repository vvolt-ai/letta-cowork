/**
 * Subagent runner — spawns a fresh conversation against the parent's
 * Letta agent and drives it through its tool-call loop until it
 * produces a final assistant message.
 *
 * Design choice: subagents share the same agent identity (and thus the
 * same memory blocks, system prompt, and client_tools) as the parent.
 * The isolation is purely **conversation-level** — the subagent gets a
 * fresh context window and doesn't see the parent's history. This
 * mirrors letta-code's "context budget" justification for delegating
 * to subagents.
 *
 * Tool access: subagents get the FULL client_tools wire list — same
 * Bash/Read/Edit/Glob/Grep/etc. the parent has. Restricting the
 * subagent's toolset would require a separate `subagentToolset`
 * config; not implemented yet.
 *
 * What this does NOT do (yet):
 *   • run_in_background — block-and-return only; TaskOutput/TaskStop
 *     come later in Option C.
 *   • subagent_type templating — all subagents currently use the
 *     parent's agent (and thus its system prompt). To get
 *     differentiated personas (researcher / reviewer / etc.) we'd add
 *     a SubagentTemplate registry mapping subagent_type → agentId.
 *   • streaming back to the renderer — the subagent's intermediate
 *     reasoning + tool calls are captured into the returned summary
 *     string but not enqueued onto the parent session's stream queue.
 */

import type { Letta } from "@letta-ai/letta-client";
import {
    getClientToolsForWire,
    isClientTool,
    runClientTool,
} from "../../client-tools/index.js";

const MAX_TURNS = 25; // safety cap mirroring our main session pump

export interface RunSubagentOptions {
    parentAgentId: string;
    /** The user-style prompt the subagent will work from. */
    prompt: string;
    /** 3–5 word task description (passed through for logging only). */
    description: string;
    /** Optional override — defaults to inheriting parent's agent. */
    agentId?: string;
    /** Optional resume — if set, subagent continues an existing conversation. */
    conversationId?: string;
    /** Per-request model override (translates to override_model in the request). */
    model?: string;
    /** Abort signal propagated from the calling tool's run context. */
    signal: AbortSignal;
}

export interface RunSubagentResult {
    conversationId: string;
    finalText: string;
    toolCallCount: number;
    turnCount: number;
    durationMs: number;
}

interface PendingToolCall {
    toolCallId: string;
    name: string;
    argumentsRaw: string;
}

interface PendingApproval {
    requestId: string;
    toolCallId: string;
    toolName: string;
    argumentsRaw: string;
}

export async function runSubagent(
    client: Letta,
    opts: RunSubagentOptions
): Promise<RunSubagentResult> {
    const startedAt = Date.now();
    const targetAgentId = opts.agentId || opts.parentAgentId;
    if (!targetAgentId) {
        throw new Error("runSubagent: no agent id available");
    }

    // 1. Create or resume conversation
    let conversationId = opts.conversationId ?? "";
    if (!conversationId) {
        const created = (await (
            client.conversations as unknown as {
                create: (body: Record<string, unknown>) => Promise<unknown>;
            }
        ).create({ agent_id: targetAgentId })) as { id?: string };
        if (!created.id) {
            throw new Error("runSubagent: conversation creation returned no id");
        }
        conversationId = created.id;
    }

    // 2. Drive the multi-turn pump (mirrors WsSession.send → runOneStreamTurn)
    const wireTools = getClientToolsForWire();
    let nextMessages: unknown[] = [
        { role: "user", content: opts.prompt },
    ];
    let toolCallCount = 0;
    let turnCount = 0;
    const finalChunks: string[] = [];

    while (turnCount < MAX_TURNS) {
        if (opts.signal.aborted) break;
        turnCount++;

        const turn = await runOneTurn({
            client,
            conversationId,
            messages: nextMessages,
            wireTools,
            model: opts.model,
            signal: opts.signal,
        });
        if (opts.signal.aborted) break;

        // Accumulate any final assistant text
        if (turn.assistantText) finalChunks.push(turn.assistantText);

        // ── Branch 1: approval-flow (client_tools-as-approval, like our main session) ──
        if (turn.approvalRequests.length > 0) {
            toolCallCount += turn.approvalRequests.length;
            const approvalEntries: unknown[] = [];
            for (const req of turn.approvalRequests) {
                if (!isClientTool(req.toolName)) {
                    approvalEntries.push({
                        type: "tool",
                        tool_call_id: req.toolCallId,
                        tool_return: `Client tool '${req.toolName}' is not registered on this device.`,
                        status: "error",
                    });
                    continue;
                }
                const args = parseArgs(req.argumentsRaw);
                const result = await runClientTool(req.toolName, args, {
                    signal: opts.signal,
                    agentId: targetAgentId,
                    conversationId,
                });
                approvalEntries.push({
                    type: "tool",
                    tool_call_id: req.toolCallId,
                    tool_return: result.output,
                    status: result.isError ? "error" : "success",
                });
            }
            nextMessages = [{ type: "approval", approvals: approvalEntries }];
            continue;
        }

        // ── Branch 2: explicit tool_call_message (newer letta_v1 path) ──
        const clientCalls = turn.toolCalls.filter((c) => isClientTool(c.name));
        if (clientCalls.length > 0) {
            toolCallCount += clientCalls.length;
            const toolReturns = await Promise.all(
                clientCalls.map(async (call) => {
                    const args = parseArgs(call.argumentsRaw);
                    const r = await runClientTool(call.name, args, {
                        signal: opts.signal,
                        agentId: targetAgentId,
                        conversationId,
                    });
                    return {
                        tool_call_id: call.toolCallId,
                        tool_return: r.output,
                        status: r.isError
                            ? ("error" as const)
                            : ("success" as const),
                    };
                })
            );
            nextMessages = [{ tool_returns: toolReturns }];
            continue;
        }

        // No more tool calls → end of subagent turn loop
        break;
    }

    return {
        conversationId,
        finalText: finalChunks.join("\n").trim() || "(subagent produced no text)",
        toolCallCount,
        turnCount,
        durationMs: Date.now() - startedAt,
    };
}

// ───────────────────────── single-turn drainer ───────────────────────

interface TurnResult {
    toolCalls: PendingToolCall[];
    approvalRequests: PendingApproval[];
    assistantText: string;
}

async function runOneTurn(args: {
    client: Letta;
    conversationId: string;
    messages: unknown[];
    wireTools: unknown[];
    model?: string;
    signal: AbortSignal;
}): Promise<TurnResult> {
    const calls = new Map<string, PendingToolCall>();
    const approvalsByTcid = new Map<string, PendingApproval>();
    let assistantText = "";

    const stream = (await (
        args.client.conversations as unknown as {
            messages: {
                create: (
                    convId: string,
                    body: Record<string, unknown>
                ) => Promise<AsyncIterable<unknown>>;
            };
        }
    ).messages.create(args.conversationId, {
        messages: args.messages,
        streaming: true,
        stream_tokens: true,
        include_pings: true,
        background: true,
        client_skills: [],
        client_tools: args.wireTools,
        include_compaction_messages: true,
        ...(args.model ? { override_model: args.model } : {}),
    })) as AsyncIterable<unknown>;

    for await (const ev of stream) {
        if (args.signal.aborted) break;
        const e = ev as Record<string, unknown>;
        const messageType = String(e.message_type ?? "");

        if (messageType === "assistant_message") {
            const text = extractText(e.content) || extractText(e.text);
            if (text) assistantText += text;
        } else if (messageType === "tool_call_message") {
            const tc = (e.tool_call as
                | {
                      tool_call_id?: string;
                      name?: string;
                      arguments?: string;
                  }
                | undefined) ?? {};
            const id = String(tc.tool_call_id ?? "");
            if (!id) continue;
            const existing = calls.get(id);
            if (existing) {
                if (tc.name && !existing.name) existing.name = tc.name;
                existing.argumentsRaw += tc.arguments ?? "";
            } else {
                calls.set(id, {
                    toolCallId: id,
                    name: tc.name ?? "",
                    argumentsRaw: tc.arguments ?? "",
                });
            }
        } else if (messageType === "approval_request_message") {
            const reqId = String(e.id ?? "");
            const tcs = (Array.isArray((e as { tool_calls?: unknown }).tool_calls)
                ? ((e as { tool_calls?: unknown[] }).tool_calls as Array<{
                      tool_call_id?: string;
                      name?: string;
                      arguments?: string;
                  }>)
                : (e as { tool_call?: unknown }).tool_call
                  ? [
                        (e as {
                            tool_call: {
                                tool_call_id?: string;
                                name?: string;
                                arguments?: string;
                            };
                        }).tool_call,
                    ]
                  : []) as Array<{
                tool_call_id?: string;
                name?: string;
                arguments?: string;
            }>;
            for (const tc of tcs) {
                const tcid = String(tc?.tool_call_id ?? "");
                if (!tcid) continue;
                const existing = approvalsByTcid.get(tcid);
                if (existing) {
                    if (tc.name && !existing.toolName) existing.toolName = tc.name;
                    existing.argumentsRaw += tc.arguments ?? "";
                } else {
                    approvalsByTcid.set(tcid, {
                        requestId: reqId,
                        toolCallId: tcid,
                        toolName: tc.name ?? "",
                        argumentsRaw: tc.arguments ?? "",
                    });
                }
            }
        }
    }

    return {
        toolCalls: Array.from(calls.values()),
        approvalRequests: Array.from(approvalsByTcid.values()),
        assistantText,
    };
}

// ───────────────────────── helpers ───────────────────────────────────

function parseArgs(raw: string): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            return parsed as Record<string, unknown>;
        }
    } catch {
        /* ignore — caller will see malformed input as empty args */
    }
    return {};
}

function extractText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((part) => {
                if (
                    part &&
                    typeof part === "object" &&
                    "type" in part &&
                    (part as Record<string, unknown>).type === "text" &&
                    "text" in part
                ) {
                    return String((part as Record<string, unknown>).text ?? "");
                }
                return "";
            })
            .filter(Boolean)
            .join("");
    }
    if (value && typeof value === "object" && "text" in value) {
        return String((value as Record<string, unknown>).text ?? "");
    }
    return "";
}
