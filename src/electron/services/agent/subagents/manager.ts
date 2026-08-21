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
 * Tool access: subagents inherit ordinary client tools from the parent,
 * including Bash/Read/Edit/Glob/Grep. `Task` itself is intentionally omitted:
 * a delegated worker must not recursively spawn the same agent while its
 * synchronous parent waits for it to finish.
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

import { Buffer } from "node:buffer";

import { runWithResourceLocks } from "./parallelism.js";
import {
    getClientToolsForWire,
    isClientTool,
    runClientTool,
} from "../../client-tools/index.js";

import type { Letta } from "@letta-ai/letta-client";
import type { ToolRunContext } from "../../client-tools/types.js";

const MAX_TURNS = 25; // safety cap mirroring our main session pump
const DEFAULT_MAX_CONCURRENT_SUBAGENTS = 10;
const DEFAULT_SUBAGENT_TIMEOUT_MS = 3 * 60_000;
const RESPONSE_STATE_HEADER = "X-Letta-Response-State";
const RESPONSE_STATE_CACHE_SCOPE = "approval_boundary";

// Task is a one-level delegation boundary. Leaving it in the child toolset
// causes prompts such as "use the recall subagent" to recursively create the
// same agent while every parent Task blocks waiting for its child.
const SUBAGENT_BLOCKED_TOOLS = new Set(["Task"]);

let activeSubagentRuns = 0;

function getMaxConcurrentSubagents(): number {
    const raw = process.env.COWORK_MAX_CONCURRENT_SUBAGENTS;
    const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_CONCURRENT_SUBAGENTS;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CONCURRENT_SUBAGENTS;
}

function acquireSubagentSlot(description: string): void {
    const limit = getMaxConcurrentSubagents();
    if (activeSubagentRuns >= limit) {
        throw new Error(
            `Subagent limit reached (${activeSubagentRuns}/${limit}). ` +
            `Cowork paused creation of '${description}' to prevent unlimited Task fan-out. ` +
            `Wait for active subtasks to finish or raise COWORK_MAX_CONCURRENT_SUBAGENTS.`
        );
    }
    activeSubagentRuns += 1;
}

function releaseSubagentSlot(): void {
    activeSubagentRuns = Math.max(0, activeSubagentRuns - 1);
}

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
    /** Abort signal propagated from the calling tool's run context. */
    signal: AbortSignal;
    /** Trusted parent context used to preserve account and runtime secrets. */
    toolContext?: ToolRunContext;
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
    acquireSubagentSlot(opts.description);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = getSubagentTimeoutMs();
    const onParentAbort = () => controller.abort();
    if (opts.signal.aborted) {
        controller.abort();
    } else {
        opts.signal.addEventListener("abort", onParentAbort, { once: true });
    }
    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    try {
        const result = await runSubagentInner(client, {
            ...opts,
            signal: controller.signal,
        });
        if (timedOut) {
            throw createSubagentTimeoutError(opts.description, timeoutMs);
        }
        return result;
    } catch (error) {
        if (timedOut) {
            throw createSubagentTimeoutError(opts.description, timeoutMs);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
        opts.signal.removeEventListener("abort", onParentAbort);
        releaseSubagentSlot();
    }
}

async function runSubagentInner(
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
    const wireTools = getClientToolsForWire().filter(
        (tool) => !SUBAGENT_BLOCKED_TOOLS.has(tool.name)
    );
    let nextMessages: unknown[] = [
        { role: "user", content: opts.prompt },
    ];
    let toolCallCount = 0;
    let turnCount = 0;
    const finalChunks: string[] = [];
    let responseStateId: string | null = null;
    let reuseResponseState = false;

    while (turnCount < MAX_TURNS) {
        if (opts.signal.aborted) break;
        turnCount++;

        console.log(
            `[Subagent] ${opts.description}: turn ${turnCount}/${MAX_TURNS} conversation=${conversationId}`
        );
        const turn = await runOneTurn({
            client,
            conversationId,
            messages: nextMessages,
            wireTools,
            signal: opts.signal,
            responseStateId: reuseResponseState ? responseStateId : null,
        });
        responseStateId = turn.responseStateId;
        reuseResponseState = false;
        if (opts.signal.aborted) break;

        // Accumulate any final assistant text
        if (turn.assistantText) finalChunks.push(turn.assistantText);

        // ── Branch 1: approval-flow (client_tools-as-approval, like our main session) ──
        //
        // Uses the resource-aware scheduler from ./parallelism so that:
        //   - read-only tools (Read/Grep/Glob/web_search/...) fan out
        //   - Edits to the same file serialize; Edits to different files
        //     run in parallel
        //   - Bash and other arbitrary-side-effect tools hold a global
        //     lock so they never race with each other or with writes
        // This mirrors letta-code's approval-execution.ts strategy and
        // is strictly safer than blanket Promise.all while keeping the
        // common fan-out cases fast.
        if (turn.approvalRequests.length > 0) {
            toolCallCount += turn.approvalRequests.length;
            const executed = await runWithResourceLocks(
                turn.approvalRequests,
                (req) => req.toolName,
                (req) => parseArgs(req.argumentsRaw),
                async (req) => {
                    if (!isClientTool(req.toolName)) {
                        return {
                            tool_call_id: req.toolCallId,
                            tool_return: `Client tool '${req.toolName}' is not registered on this device.`,
                            status: "error" as const,
                        };
                    }
                    const args = parseArgs(req.argumentsRaw);
                    const result = await runClientTool(req.toolName, args, {
                        signal: opts.signal,
                        agentId: targetAgentId,
                        conversationId,
                        toolCallId: req.toolCallId,
                        lettaClient: opts.toolContext?.lettaClient,
                        lettaConnectionId: opts.toolContext?.lettaConnectionId,
                        runtimeEnv: opts.toolContext?.runtimeEnv,
                    });
                    return {
                        tool_call_id: req.toolCallId,
                        tool_return: result.output,
                        status: result.isError
                            ? ("error" as const)
                            : ("success" as const),
                    };
                }
            );
            const approvalEntries = executed.map((e) => ({
                type: "tool",
                tool_call_id: e.tool_call_id,
                tool_return: e.tool_return,
                status: e.status,
            }));
            nextMessages = [{ type: "approval", approvals: approvalEntries }];
            // Resume the exact response that requested these client tools.
            // Without this token, Letta can replay the original child turn.
            reuseResponseState = true;
            continue;
        }

        // ── Branch 2: explicit tool_call_message (newer letta_v1 path) ──
        const clientCalls = turn.toolCalls.filter((c) => isClientTool(c.name));
        if (clientCalls.length > 0) {
            toolCallCount += clientCalls.length;
            const toolReturns = await runWithResourceLocks(
                clientCalls,
                (call) => call.name,
                (call) => parseArgs(call.argumentsRaw),
                async (call) => {
                    const args = parseArgs(call.argumentsRaw);
                    const r = await runClientTool(call.name, args, {
                        signal: opts.signal,
                        agentId: targetAgentId,
                        conversationId,
                        toolCallId: call.toolCallId,
                        lettaClient: opts.toolContext?.lettaClient,
                        lettaConnectionId: opts.toolContext?.lettaConnectionId,
                        runtimeEnv: opts.toolContext?.runtimeEnv,
                    });
                    return {
                        tool_call_id: call.toolCallId,
                        tool_return: r.output,
                        status: r.isError
                            ? ("error" as const)
                            : ("success" as const),
                    };
                }
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
    responseStateId: string | null;
}

async function runOneTurn(args: {
    client: Letta;
    conversationId: string;
    messages: unknown[];
    wireTools: unknown[];
    signal: AbortSignal;
    responseStateId: string | null;
}): Promise<TurnResult> {
    const calls = new Map<string, PendingToolCall>();
    const approvalsByTcid = new Map<string, PendingApproval>();
    let assistantText = "";
    let responseStateId: string | null = null;
    const headers: Record<string, string> = {};
    if (args.responseStateId) {
        headers[RESPONSE_STATE_HEADER] = encodeResponseStateHeader(args.responseStateId);
    }

    const stream = (await (
        args.client.conversations as unknown as {
            messages: {
                create: (
                    convId: string,
                    body: Record<string, unknown>,
                    options?: {
                        headers?: Record<string, string>;
                        signal?: AbortSignal;
                    }
                ) => Promise<AsyncIterable<unknown>>;
            };
        }
    ).messages.create(
        args.conversationId,
        {
            messages: args.messages,
            streaming: true,
            stream_tokens: true,
            include_pings: true,
            background: true,
            client_skills: [],
            client_tools: args.wireTools,
            include_compaction_messages: true,
        },
        {
            ...(Object.keys(headers).length > 0 ? { headers } : {}),
            signal: args.signal,
        }
    )) as AsyncIterable<unknown>;

    for await (const ev of stream) {
        if (args.signal.aborted) break;
        const e = ev as Record<string, unknown>;
        const messageType = String(e.message_type ?? "");
        const capturedResponseStateId = getResponseStateId(e);
        if (capturedResponseStateId) {
            responseStateId = capturedResponseStateId;
        }

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
        responseStateId,
    };
}

// ───────────────────────── helpers ───────────────────────────────────

function getSubagentTimeoutMs(): number {
    const configured = Number.parseInt(
        process.env.COWORK_SUBAGENT_TIMEOUT_MS ?? "",
        10
    );
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_SUBAGENT_TIMEOUT_MS;
}

function createSubagentTimeoutError(
    description: string,
    timeoutMs: number
): Error {
    return new Error(
        `Subagent timed out after ${timeoutMs} ms while running '${description}'`
    );
}

function getResponseStateId(event: Record<string, unknown>): string | null {
    if (
        event.message_type !== "response_state" ||
        event.cache_scope !== RESPONSE_STATE_CACHE_SCOPE
    ) {
        return null;
    }
    return typeof event.response_id === "string" && event.response_id
        ? event.response_id
        : null;
}

function encodeResponseStateHeader(previousResponseId: string): string {
    return Buffer.from(
        JSON.stringify({
            v: 1,
            cache_scope: RESPONSE_STATE_CACHE_SCOPE,
            previous_response_id: previousResponseId,
        }),
        "utf8"
    ).toString("base64url");
}

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
