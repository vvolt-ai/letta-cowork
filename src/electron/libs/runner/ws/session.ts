/**
 * WsSession — WebSocket-style streaming session over Letta's
 * `client.conversations.messages.create()` SSE endpoint.
 *
 * Why this and not the listener pattern: Letta's
 * `/v1/environments/register` listener routes messages to a registered
 * device that's expected to run the agent loop locally (the
 * letta-code CLI model). Cowork is a chat client — the agent must run
 * server-side. The SDK exposes that path via
 * `client.conversations.messages.create(conversationId, {streaming:true})`,
 * which returns an async-iterable Stream<LettaStreamingResponse>.
 *
 * Public surface mirrors `@letta-ai/letta-code-sdk`'s `Session` so the
 * existing runner / event-handler / abort-handler all keep working
 * without changes.
 *
 * Multi-conversation: each WsSession instance owns its own SDK call
 * and pump. Concurrent sessions don't share any state, so there's no
 * routing or fan-out to worry about.
 */

import { Letta } from "@letta-ai/letta-client";
import type { Stream } from "@letta-ai/letta-client/core/streaming";
import type {
    LettaStreamingResponse,
    ToolReturn,
} from "@letta-ai/letta-client/resources/agents/messages";
import {
    getClientToolsForWire,
    isClientTool,
    runClientTool,
} from "../../../services/client-tools/index.js";
import { clearPendingApprovals } from "../../../services/agents/approval-recovery.js";
import type {
    SDKAssistantMessage,
    SDKErrorMessage,
    SDKInitMessage,
    SDKMessage,
    SDKReasoningMessage,
    SDKResultMessage,
    SDKToolCallMessage,
    SDKToolResultMessage,
    SendMessage,
    CanUseToolResponse,
} from "@letta-ai/letta-code-sdk";
import { debug } from "../logger.js";

export interface WsSessionOptions {
    cwd?: string;
    permissionMode?: "bypassPermissions";
    canUseTool?: (
        toolName: string,
        input: unknown
    ) => Promise<CanUseToolResponse>;
    systemInfoReminder?: boolean;
    model?: string;
    /** Pre-known conversation id (resume path). */
    conversationId?: string;
    /** Pre-known agent id. */
    agentId?: string;
}

let cachedClient: Letta | null = null;
let cachedKey = "";
let cachedBase = "";

function getClient(): Letta {
    const apiKey = (process.env.LETTA_API_KEY ?? "").trim();
    const baseURL = (
        process.env.LETTA_BASE_URL || "https://api.letta.com"
    ).trim();
    if (!apiKey) throw new Error("LETTA_API_KEY is not configured");
    if (cachedClient && cachedKey === apiKey && cachedBase === baseURL) {
        return cachedClient;
    }
    cachedKey = apiKey;
    cachedBase = baseURL;
    cachedClient = new Letta({ apiKey, baseURL });
    return cachedClient;
}

export class WsSession {
    private opts: WsSessionOptions;
    private _agentId: string | null;
    private _conversationId: string | null;
    private initialized = false;

    /** Pending stream messages waiting for a consumer. */
    private streamQueue: SDKMessage[] = [];
    /** Resolvers for consumers awaiting the next message. */
    private streamResolvers: Array<(msg: SDKMessage | null) => void> = [];
    private streamClosed = false;
    /** Active background pumps — keyed by run/turn id for clean teardown. */
    private activePumps = new Set<AbortController>();
    private startedAt: number = Date.now();

    constructor(opts: WsSessionOptions = {}) {
        this.opts = opts;
        this._agentId = opts.agentId ?? null;
        this._conversationId = opts.conversationId ?? null;
        console.log(
            "[WsSession] constructed (build-id: client_tools-v13-task-subagent)"
        );
    }

    get agentId(): string | null {
        return this._agentId;
    }

    get conversationId(): string | null {
        return this._conversationId;
    }

    /**
     * Initialize the session. For new sessions, creates a conversation
     * via REST so we have a conversation_id to send into. For resumed
     * sessions, this is just a no-op other than the init enqueue.
     */
    async initialize(): Promise<SDKInitMessage> {
        if (this.initialized && this._agentId && this._conversationId) {
            return this.buildInitMessage();
        }

        const client = getClient();

        // Resolve agent id (constructor → env → fail).
        if (!this._agentId) {
            const envAgentId = (process.env.LETTA_AGENT_ID ?? "").trim();
            if (!envAgentId) {
                throw new Error(
                    "WsSession.initialize: no agentId provided and LETTA_AGENT_ID not set"
                );
            }
            this._agentId = envAgentId;
        }

        // Create a fresh conversation if we don't already have one.
        if (!this._conversationId) {
            debug("WsSession: creating new conversation for agent", {
                agentId: this._agentId,
            });
            const created = (await (
                client.conversations as unknown as {
                    create: (body: Record<string, unknown>) => Promise<unknown>;
                }
            ).create({ agent_id: this._agentId })) as { id?: string };
            if (!created.id) {
                throw new Error(
                    "WsSession.initialize: conversation creation returned no id"
                );
            }
            this._conversationId = created.id;
            debug("WsSession: created conversation", {
                conversationId: this._conversationId,
            });
        }

        this.initialized = true;
        const init = this.buildInitMessage();
        this.enqueue(init);
        return init;
    }

    /**
     * Send a user message into the conversation. Spawns a background
     * pump that reads the SSE stream and enqueues SDKMessages.
     *
     * Multi-turn agent loop: when the stream finishes with pending
     * client_tool calls (Bash, Skill, etc.), we execute them locally
     * and re-call messages.create with `tool_return_create` payloads.
     * The loop continues until the stream ends without unresolved
     * client tools.
     *
     * Resolves as soon as the first stream is in flight — the runner
     * begins iterating consumer-side stream() while the pump runs.
     */
    async send(message: SendMessage): Promise<void> {
        if (!this.initialized) await this.initialize();
        if (!this._agentId || !this._conversationId) {
            throw new Error("WsSession.send: not initialized");
        }

        const initialMessages = [
            {
                role: "user" as const,
                content:
                    typeof message === "string"
                        ? message
                        : message.map((m) => {
                              if (m.type === "text") {
                                  return { type: "text" as const, text: m.text };
                              }
                              // Image content blocks: the agent's model may
                              // not be vision-capable, but the URL is still
                              // useful — agents can fetch the bytes, share
                              // the link, or hand it to a downstream tool.
                              // Surface the URL as text so it never gets
                              // dropped. Vision-capable agents can switch
                              // back to passing the typed image block when
                              // we wire that up.
                              const anyM = m as unknown as {
                                  type?: string;
                                  source?: { url?: string; data?: string };
                                  image_url?: string | { url?: string };
                                  url?: string;
                              };
                              const url =
                                  anyM.source?.url ||
                                  (typeof anyM.image_url === "string"
                                      ? anyM.image_url
                                      : anyM.image_url?.url) ||
                                  anyM.url;
                              if (anyM.type === "image" && url) {
                                  return { type: "text" as const, text: `[image: ${url}]` };
                              }
                              return { type: "text" as const, text: "[image omitted]" };
                          }),
            },
        ];

        const ctrl = new AbortController();
        this.activePumps.add(ctrl);
        this.startedAt = Date.now();

        // Detect the Letta CONFLICT response that fires when the conversation
        // has a pending tool approval. Recoverable: cancel the stuck runs and
        // retry the send once.
        const isApprovalConflictError = (msg: string): boolean => {
            return (
                /CONFLICT/i.test(msg) &&
                /(waiting for approval|pending approval|approval on a tool call)/i.test(msg)
            );
        };

        // Background pump — multi-turn loop, fire-and-forget.
        // Wrapped in an outer retry loop so we can recover once from approval
        // conflicts that race past the pre-flight recoverStuckApprovals call.
        void (async () => {
            let attempt = 0;
            const MAX_ATTEMPTS = 2;

            // eslint-disable-next-line no-constant-condition
            while (true) {
            attempt++;
            try {
                let nextMessages: unknown[] = initialMessages;
                let turnCount = 0;
                const MAX_TURNS = 25; // safety cap against runaway tool loops

                while (turnCount < MAX_TURNS) {
                    if (ctrl.signal.aborted) break;
                    turnCount++;

                    // Mirror letta-code's approval-conflict recovery: clear
                    // any prior stuck "requires_approval" runs before
                    // sending. Without this, the server returns CONFLICT
                    // and the conversation is permanently blocked.
                   // await this.recoverStuckApprovals();
                    if (ctrl.signal.aborted) break;

                    const turnResult = await this.runOneStreamTurn(
                        nextMessages,
                        ctrl
                    );
                    if (ctrl.signal.aborted) break;

                    // ── Branch 1: approval-required flow ──────────────
                    // letta_v1_agent surfaces every client_tool call as
                    // an approval_request_message. The wire shape for the
                    // response — taken verbatim from letta-code's
                    // approval-result-normalization — is:
                    //   {type:"approval", approvals:[
                    //     {type:"tool", tool_call_id, tool_return, status, stdout?, stderr?},
                    //     {type:"approval", tool_call_id, approve:false, reason}, // for denials
                    //   ]}
                    // i.e. on auto-allow we EXECUTE the tool here and
                    // place the output inside the approvals array as a
                    // type:"tool" entry. Wrong shape (e.g. {approval_request_id, approve:true})
                    // makes the server fall through to its own dispatch
                    // and respond "Tool not found".
                    if (turnResult.approvalRequests.length > 0) {
                        const allow =
                            this.opts.permissionMode === "bypassPermissions";
                        console.log(
                            `[WsSession] auto-${allow ? "allow" : "deny"} ${turnResult.approvalRequests.length} approval(s)`,
                            turnResult.approvalRequests.map((r) => r.toolName)
                        );

                        const approvalEntries: unknown[] = [];
                        if (allow) {
                            // Execute each approved tool locally, then
                            // build the type:"tool" entries.
                            const executed = await Promise.all(
                                turnResult.approvalRequests.map(async (req) => {
                                    const args = parseToolArgs(req.argumentsRaw);
                                    if (!isClientTool(req.toolName)) {
                                        return {
                                            tool_call_id: req.toolCallId,
                                            tool_return: `Client tool '${req.toolName}' is not registered on this device.`,
                                            status: "error" as const,
                                        };
                                    }
                                    const r = await runClientTool(
                                        req.toolName,
                                        args,
                                        {
                                            signal: ctrl.signal,
                                            agentId: this._agentId ?? undefined,
                                            conversationId:
                                                this._conversationId ?? undefined,
                                        }
                                    );
                                    // Mirror to the renderer so the user
                                    // sees the tool_call + tool_result.
                                    this.enqueue({
                                        type: "tool_call",
                                        toolCallId: req.toolCallId,
                                        toolName: req.toolName,
                                        toolInput: args,
                                        rawArguments: req.argumentsRaw,
                                        uuid: `toolcall-${req.toolCallId}`,
                                    } as unknown as SDKToolCallMessage);
                                    this.enqueue({
                                        type: "tool_result",
                                        toolCallId: req.toolCallId,
                                        content: r.output,
                                        isError: r.isError,
                                        uuid: `tool-result-${req.toolCallId}`,
                                    } as unknown as SDKToolResultMessage);
                                    return {
                                        tool_call_id: req.toolCallId,
                                        tool_return: r.output,
                                        status: r.isError
                                            ? ("error" as const)
                                            : ("success" as const),
                                    };
                                })
                            );
                            for (const e of executed) {
                                approvalEntries.push({
                                    type: "tool",
                                    tool_call_id: e.tool_call_id,
                                    tool_return: e.tool_return,
                                    status: e.status,
                                });
                            }
                        } else {
                            for (const req of turnResult.approvalRequests) {
                                approvalEntries.push({
                                    type: "approval",
                                    tool_call_id: req.toolCallId,
                                    approve: false,
                                    reason: `Tool '${req.toolName || "unknown"}' was denied by the client.`,
                                });
                            }
                        }
                        // Wire shape: ONE message of type "approval" with
                        // an `approvals` array — NOT N messages.
                        nextMessages = [
                            {
                                type: "approval",
                                approvals: approvalEntries,
                            },
                        ];
                        continue;
                    }

                    // ── Branch 2: stop_reason=requires_approval but no
                    //    inline approval_request_message. Older agents
                    //    surface a pending approval ONLY through the run
                    //    state, not the stream. Cancel the run via REST
                    //    so the conversation doesn't permanently block.
                    if (turnResult.sawRequiresApprovalStop) {
                        console.warn(
                            "[WsSession] stream ended with requires_approval — cancelling stuck run via REST"
                        );
                        await this.recoverStuckApprovals();
                        // Surface a friendly notice in the chat so the
                        // user knows what happened.
                        this.enqueue({
                            type: "error",
                            message:
                                "The agent attempted a tool that isn't enabled on this agent. The pending approval has been cleared. To unlock device tools (Bash, Skill, file ops), migrate this agent to letta_v1_agent — see README.",
                        } as SDKErrorMessage);
                        break;
                    }

                    // ── Branch 3: client_tools (letta_v1_agent path) ─────
                    // Filter to only OUR client tools — server-side tools
                    // (e.g. web_search) are run by Letta itself.
                    const clientCalls = turnResult.toolCalls.filter((c) =>
                        isClientTool(c.name)
                    );
                    if (clientCalls.length === 0) break; // turn done

                    // Execute the client tools and prepare returns.
                    const toolReturns = await Promise.all(
                        clientCalls.map(async (call) => {
                            const args = parseToolArgs(call.argumentsRaw);
                            const result = await runClientTool(
                                call.name,
                                args,
                                {
                                    signal: ctrl.signal,
                                    agentId: this._agentId ?? undefined,
                                    conversationId:
                                        this._conversationId ?? undefined,
                                }
                            );
                            this.enqueue({
                                type: "tool_result",
                                toolCallId: call.toolCallId,
                                content: result.output,
                                isError: result.isError,
                                uuid: `tool-result-${call.toolCallId}`,
                            } as unknown as SDKToolResultMessage);
                            return {
                                tool_call_id: call.toolCallId,
                                tool_return: result.output,
                                status: result.isError
                                    ? ("error" as const)
                                    : ("success" as const),
                            } satisfies ToolReturn;
                        })
                    );

                    if (ctrl.signal.aborted) break;
                    nextMessages = [{ tool_returns: toolReturns }];
                }

                if (turnCount >= MAX_TURNS) {
                    this.enqueue({
                        type: "error",
                        message: `Hit max client-tool turn cap (${MAX_TURNS}). Stopping.`,
                    } as SDKErrorMessage);
                }

                // Final terminal — UI flips out of "thinking".
                this.enqueue({
                    type: "result",
                    success: true,
                    durationMs: Date.now() - this.startedAt,
                    conversationId: this._conversationId,
                } as SDKResultMessage);
                // Successful pump — break the retry loop.
                break;
            } catch (err) {
                if (ctrl.signal.aborted) {
                    this.activePumps.delete(ctrl);
                    return;
                }
                const errMessage =
                    err instanceof Error ? err.message : String(err);

                // If this is an approval-conflict race AND we have retries
                // left, cancel the stuck runs server-side and retry the
                // entire pump once. Without this, headless callers (e.g.
                // /letta/respond, scheduler) hit a permanent CONFLICT
                // whenever a pending approval is in flight.
                if (
                    isApprovalConflictError(errMessage) &&
                    attempt < MAX_ATTEMPTS
                ) {
                    console.warn(
                        `[WsSession] approval conflict on attempt ${attempt}, recovering and retrying:`,
                        errMessage
                    );
                    try {
                        await this.recoverStuckApprovals();
                    } catch (recoverErr) {
                        console.warn(
                            "[WsSession] recoverStuckApprovals during retry failed:",
                            recoverErr instanceof Error
                                ? recoverErr.message
                                : String(recoverErr)
                        );
                    }
                    // Loop back and retry the pump from scratch.
                    continue;
                }

                console.error("[WsSession] stream pump failed:", err);
                this.enqueue({
                    type: "error",
                    message: errMessage,
                } as SDKErrorMessage);
                this.enqueue({
                    type: "result",
                    success: false,
                    error: errMessage,
                    durationMs: Date.now() - this.startedAt,
                    conversationId: this._conversationId,
                } as SDKResultMessage);
                break;
            }
            } // end retry while-loop

            this.activePumps.delete(ctrl);
        })();
    }

    /**
     * Pre-flight (and post-stop) recovery: clear any stuck
     * "requires_approval" state on this conversation. Without this,
     * the server rejects the next messages.create with CONFLICT —
     * "Cannot send a new message: The agent is waiting for approval
     * on a tool call."
     *
     * Delegates to the canonical helper in
     * services/agents/approval-recovery.ts which mirrors letta-code's
     * `getResumeDataFromBackend` + `resolveAllPendingApprovals`
     * pattern: discover via `conversation.in_context_message_ids`
     * (not `runs.list`), filter out already-completed tool_call_ids,
     * submit a real `{type:'approval', approvals:[...]}` rejection,
     * and loop until the conversation is clean (handles cascading
     * parallel approvals).
     *
     * Best-effort. Failures are logged and we continue — the actual
     * send will surface a clearer error if the conflict persists.
     */
    private async recoverStuckApprovals(): Promise<void> {
        if (!this._agentId || !this._conversationId) return;
        try {
            await clearPendingApprovals(getClient(), this._conversationId);
        } catch (err) {
            console.warn(
                "[WsSession] recoverStuckApprovals failed:",
                err instanceof Error ? err.message : String(err)
            );
        }
    }

    /**
     * Run a single agent turn — open the SSE stream, consume every
     * event, return the tool_call_messages we saw (deduped by
     * tool_call_id; arguments accumulated across deltas).
     */
    private async runOneStreamTurn(
        messages: unknown[],
        ctrl: AbortController
    ): Promise<{
        toolCalls: PendingToolCall[];
        approvalRequests: PendingApproval[];
        sawRequiresApprovalStop: boolean;
    }> {
        const client = getClient();
        const conversationId = this._conversationId!;
        const calls = new Map<string, PendingToolCall>();
        // Dedupe approvals by tool_call_id — argument fragments stream in
        // across multiple approval_request_message events for the same call.
        const approvalsByTcid = new Map<string, PendingApproval>();
        let sawRequiresApprovalStop = false;

        const wireTools = getClientToolsForWire();
        console.log(
            `[WsSession] messages.create → conv=${conversationId} client_tools=[${wireTools
                .map((t) => t.name)
                .join(", ")}] background=true include_pings=true`
        );

        const stream = (await (
            client.conversations as unknown as {
                messages: {
                    create: (
                        convId: string,
                        body: Record<string, unknown>
                    ) => Promise<Stream<LettaStreamingResponse>>;
                };
            }
        ).messages.create(conversationId, {
            // Mirror letta-code's exact request body shape from
            // src/agent/message.ts → buildConversationMessagesCreateRequestBody.
            // Missing any of these fields (especially `background: true`)
            // causes the server to NOT route client-tool calls back to us
            // and instead return "Tool not found" via tool_return_message.
            messages,
            streaming: true,
            stream_tokens: true,
            include_pings: true,
            background: true,
            client_skills: [],
            client_tools: wireTools,
            include_compaction_messages: true,
        })) as Stream<LettaStreamingResponse>;

        for await (const event of stream as AsyncIterable<LettaStreamingResponse>) {
            if (ctrl.signal.aborted) break;
            this.handleStreamingEvent(event);

            // Track tool_call_messages so we can dispatch after the
            // stream ends. arguments arrive in fragments — concat.
            const e = event as unknown as Record<string, unknown>;
            const messageType = String(e.message_type ?? "");
            if (messageType === "tool_call_message") {
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
            } else if (messageType === "stop_reason") {
                const stopReasonRaw = String(
                    (e as { stop_reason?: unknown }).stop_reason ?? ""
                );
                console.log(
                    `[WsSession] stream stop_reason event: '${stopReasonRaw}'`
                );
                // Older agent types signal pending approval only here —
                // not via approval_request_message. The run is left in
                // "requires_approval" state and we must cancel it via
                // REST or it blocks every subsequent send to this
                // conversation.
                if (stopReasonRaw.toLowerCase() === "requires_approval") {
                    sawRequiresApprovalStop = true;
                    console.log(
                        "[WsSession] flagged sawRequiresApprovalStop=true"
                    );
                }
            } else if (messageType === "approval_request_message") {
                // letta_v1_agent surfaces every client_tool call as an
                // approval_request_message. We must execute the tool
                // locally and return the result inside the next message's
                // approvals[] array (shape: {type:"tool", tool_call_id,
                // tool_return, status}). The argument fragments stream in
                // — dedupe on tool_call_id and concat .arguments.
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

        const result = {
            toolCalls: Array.from(calls.values()),
            approvalRequests: Array.from(approvalsByTcid.values()),
            sawRequiresApprovalStop,
        };
        console.log("[WsSession] runOneStreamTurn returning", {
            toolCallCount: result.toolCalls.length,
            approvalCount: result.approvalRequests.length,
            sawRequiresApprovalStop: result.sawRequiresApprovalStop,
        });
        return result;
    }

    /** Async iterator over inbound SDKMessage values. */
    async *stream(): AsyncGenerator<SDKMessage> {
        while (true) {
            if (this.streamQueue.length > 0) {
                const next = this.streamQueue.shift();
                if (next) yield next;
                continue;
            }
            if (this.streamClosed) return;
            const next = await new Promise<SDKMessage | null>((resolve) => {
                this.streamResolvers.push(resolve);
            });
            if (next === null) return;
            yield next;
        }
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.close();
    }

    close(): void {
        const hadActivePumps = this.activePumps.size > 0;
        for (const ctrl of this.activePumps) ctrl.abort();
        this.activePumps.clear();
        this.streamClosed = true;
        for (const resolve of this.streamResolvers) resolve(null);
        this.streamResolvers = [];

        // If the user clicked stop mid-turn while a tool approval was
        // pending, the server-side conversation is left in
        // `requires_approval`. The next inbound message would 409 with
        // CONFLICT until the pre-flight recovery clears it. Doing the
        // cleanup here too means the stop button takes effect end-to-
        // end: kill the local pump AND tell the server to drop the
        // pending approval. Fire-and-forget; failures fall through to
        // the next session's pre-flight recovery.
        if (hadActivePumps && this._agentId && this._conversationId) {
            // void this.recoverStuckApprovals().catch((err) => {
            //     debug("WsSession: post-close recovery failed (non-fatal)", {
            //         error:
            //             err instanceof Error ? err.message : String(err),
            //     });
            // });
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Internal — translate LettaStreamingResponse → SDKMessage
    // ─────────────────────────────────────────────────────────────────

    private buildInitMessage(): SDKInitMessage {
        return {
            type: "init",
            agentId: this._agentId ?? "",
            sessionId: this._conversationId ?? "",
            conversationId: this._conversationId ?? "",
            model: this.opts.model ?? "",
            tools: [],
            memfsEnabled: false,
        };
    }

    private enqueue(msg: SDKMessage): void {
        if (this.streamResolvers.length > 0) {
            const resolve = this.streamResolvers.shift();
            if (resolve) {
                resolve(msg);
                return;
            }
        }
        this.streamQueue.push(msg);
    }

    private handleStreamingEvent(event: LettaStreamingResponse): void {
        // Discriminate on `message_type` — every variant has it.
        const e = event as unknown as Record<string, unknown>;
        const messageType = String(e.message_type ?? "");

        switch (messageType) {
            case "assistant_message": {
                const text = extractText(e.content);
                if (!text) return;
                this.enqueue({
                    type: "assistant",
                    content: text,
                    uuid: String(e.id ?? Date.now()),
                } as SDKAssistantMessage);
                return;
            }
            case "reasoning_message":
            case "hidden_reasoning_message": {
                const text =
                    extractText(e.reasoning) || extractText(e.content);
                if (!text) return;
                // SDKReasoningMessage requires { type, content, uuid }.
                this.enqueue({
                    type: "reasoning",
                    content: text,
                    uuid: String(e.id ?? `reasoning-${Date.now()}-${Math.random()}`),
                    runId: typeof e.run_id === "string" ? e.run_id : undefined,
                } as SDKReasoningMessage);
                return;
            }
            case "tool_call_message": {
                const tc = (e.tool_call as
                    | {
                          tool_call_id?: string;
                          name?: string;
                          arguments?: string;
                      }
                    | undefined) ?? {};
                // SDKToolCallMessage requires { type, toolCallId, toolName,
                // toolInput, uuid }. Streaming tool_call events arrive as
                // partial JSON-string fragments — the SDK accumulates them
                // via `rawArguments`.
                let parsedInput: Record<string, unknown> = {};
                if (tc.arguments) {
                    try {
                        const parsed = JSON.parse(tc.arguments);
                        if (parsed && typeof parsed === "object") {
                            parsedInput = parsed as Record<string, unknown>;
                        }
                    } catch {
                        // Partial / non-JSON fragment — leave parsedInput empty,
                        // consumer reads rawArguments for live token display.
                    }
                }
                this.enqueue({
                    type: "tool_call",
                    toolCallId: String(tc.tool_call_id ?? ""),
                    toolName: tc.name ?? "",
                    toolInput: parsedInput,
                    rawArguments: tc.arguments,
                    uuid: String(e.id ?? `toolcall-${Date.now()}-${Math.random()}`),
                    runId: typeof e.run_id === "string" ? e.run_id : undefined,
                } as SDKToolCallMessage);
                return;
            }
            case "tool_return_message": {
                const callId = String(e.tool_call_id ?? "");
                const status =
                    String(e.status ?? "success").toLowerCase() === "success"
                        ? "success"
                        : "error";
                const out = extractText(e.tool_return) || extractText(e.stdout);
                // SDKToolResultMessage uses `content` (not `output`).
                this.enqueue({
                    type: "tool_result",
                    toolCallId: callId,
                    content: out,
                    isError: status === "error",
                    uuid: String(e.id ?? `toolret-${Date.now()}-${Math.random()}`),
                    runId: typeof e.run_id === "string" ? e.run_id : undefined,
                } as SDKToolResultMessage);
                return;
            }
            case "system_message":
            case "user_message":
                // Echoes — runner doesn't need them as SDKMessages.
                return;
            case "approval_request_message": {
                // The legacy approval flow handled this here. We now use
                // the runtime client_tools mechanism instead — pending
                // tool calls are collected in runOneStreamTurn and the
                // results are sent back via tool_returns. Nothing to do
                // here except let the agent see the message — the UI
                // will render it as info if relevant.
                return;
            }
            case "stop_reason": {
                // DO NOT emit a {type:"result"} here. Each individual
                // stream in a multi-turn pump fires a stop_reason event
                // (requires_approval → end_turn → next_turn → end_turn …),
                // so emitting "result" here flips the UI to "completed"
                // mid tool-execution. Only the pump's finally block in
                // send() emits the single terminal result for the whole
                // user turn.
                //
                // We still log so the trace stays useful for debugging.
                debug("WsSession: intermediate stop_reason", {
                    stopReason: String(e.stop_reason ?? ""),
                });
                return;
            }
            case "letta_ping":
                return;
            case "usage_statistics":
                return;
            default:
                debug("WsSession: unknown streaming event", {
                    messageType,
                    keys: Object.keys(e).slice(0, 10),
                });
                return;
        }
    }

    // (The legacy `respondToApproval` REST helper used to live here.
    //  Removed — runtime client_tools handles approvals now via
    //  tool_returns sent in the next messages.create call.)
}

interface PendingToolCall {
    toolCallId: string;
    name: string;
    /** Concatenated JSON-string fragments from the stream. */
    argumentsRaw: string;
}

interface PendingApproval {
    /** approval_request_message.id — kept for logging/parity. */
    requestId: string;
    /** tool_call.tool_call_id — THE field the server matches approvals on. */
    toolCallId: string;
    /** Tool name from tool_call.name. */
    toolName: string;
    /** Tool arguments JSON — accumulated across stream fragments. */
    argumentsRaw: string;
}

function parseToolArgs(raw: string): Record<string, unknown> {
    if (!raw || typeof raw !== "string") return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        // Common case during partial streaming: malformed JSON. Return
        // empty so the runner can fail gracefully with a useful error.
    }
    return {};
}

function extractText(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value
            .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object") {
                    const it = item as Record<string, unknown>;
                    return String(it.text ?? it.content ?? "");
                }
                return "";
            })
            .join("");
    }
    if (typeof value === "object") {
        const v = value as Record<string, unknown>;
        return String(v.text ?? v.content ?? "");
    }
    return "";
}
