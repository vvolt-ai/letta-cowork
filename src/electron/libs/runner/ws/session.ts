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
import { Buffer } from "node:buffer";
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
import { runWithResourceLocks } from "../../../services/agent/subagents/parallelism.js";
import { PlanModeManager } from "./plan-mode/mode-manager.js";
import {
    buildTurnReminders,
    createReminderState,
    type ReminderState,
} from "./plan-mode/reminders.js";
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

const RESPONSE_STATE_HEADER = "X-Letta-Response-State";
const RESPONSE_STATE_CACHE_SCOPE = "approval_boundary";

function getResponseStateId(event: unknown): string | null {
    if (!event || typeof event !== "object") return null;
    const candidate = event as {
        message_type?: unknown;
        response_id?: unknown;
        cache_scope?: unknown;
    };
    if (
        candidate.message_type !== "response_state" ||
        candidate.cache_scope !== RESPONSE_STATE_CACHE_SCOPE
    ) {
        return null;
    }
    return typeof candidate.response_id === "string" && candidate.response_id
        ? candidate.response_id
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

    /**
     * Per-session plan-mode manager. Tracks plan/unrestricted mode and the
     * assigned plan file path. Threaded into the tool-run context so
     * EnterPlanMode/ExitPlanMode/UpdatePlan can read+mutate. Exposed as
     * public so the renderer-side IPC handler (plan-state IPC) can subscribe
     * to onChange and surface state to the UI.
     */
    public readonly planMode = new PlanModeManager();

    /** Reminder dedup state — one-shot reminders fire once. */
    private readonly reminderState: ReminderState = createReminderState();

    /** Pending stream messages waiting for a consumer. */
    private streamQueue: SDKMessage[] = [];
    /** Resolvers for consumers awaiting the next message. */
    private streamResolvers: Array<(msg: SDKMessage | null) => void> = [];
    private streamClosed = false;
    /** Active background pumps and their settlement promises. */
    private activePumps = new Map<AbortController, Promise<void>>();
    /** Server run ids observed on this session, used for targeted cancellation. */
    private activeServerRunIds = new Set<string>();
    private startedAt: number = Date.now();
    /** Local monotonic turn id used to ignore stale terminal events in the UI. */
    private turnSeq = 0;
    private activeClientRunId: string | null = null;
    /** Last server response-state id for auto approval continuations. */
    private responseStateId: string | null = null;

    constructor(opts: WsSessionOptions = {}) {
        this.opts = opts;
        this._agentId = opts.agentId ?? null;
        this._conversationId = opts.conversationId ?? null;
        console.log(
            "[WsSession] constructed (build-id: client_tools-v14-task-crud)"
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
        if (this.activePumps.size > 0) {
            throw new Error(
                "WsSession.send: this session already owns an active turn"
            );
        }
        if (this.streamClosed) {
            throw new Error("WsSession.send: session is already closed");
        }

        // Build system reminders for this turn (plan-mode banner,
        // permission-mode change). Prepended to the user message so the
        // agent sees the state BEFORE responding. See plan-mode/reminders.ts.
        const reminderText = buildTurnReminders({
            planMode: this.planMode,
            state: this.reminderState,
            workingDirectory: this.opts.cwd ?? process.cwd(),
        });

        const initialMessages = [
            {
                role: "user" as const,
                content:
                    typeof message === "string"
                        ? (reminderText ? `${reminderText}\n\n${message}` : message)
                        : (reminderText
                            ? [{ type: "text" as const, text: reminderText }, ...message]
                            : message
                          ).map((m) => {
                              if (m.type === "text") {
                                  return { type: "text" as const, text: m.text };
                              }
                              // Image content blocks: pass through to Letta as
                              // a typed image block. Letta's SDK accepts:
                              //   { type: "image", source: { type: "url"|"base64"|"letta", ... } }
                              // The renderer (PromptInput) already builds this
                              // shape. We normalize legacy variants (image_url,
                              // raw .url) into the canonical form. Vision-
                              // capable models will see the actual pixels;
                              // non-vision models will surface a server-side
                              // error which is the correct signal.
                              const anyM = m as unknown as {
                                  type?: string;
                                  source?: {
                                      type?: string;
                                      url?: string;
                                      data?: string;
                                      media_type?: string;
                                      file_id?: string;
                                      detail?: string | null;
                                  };
                                  image_url?: string | { url?: string };
                                  url?: string;
                              };

                              if (anyM.type === "image") {
                                  // Already canonical: { type:"image", source:{...} }
                                  if (anyM.source && (anyM.source.url || anyM.source.data || anyM.source.file_id)) {
                                      return { type: "image" as const, source: anyM.source };
                                  }
                                  // OpenAI-style: { type:"image_url", image_url: "..." | {url} }
                                  const fromImageUrl =
                                      typeof anyM.image_url === "string"
                                          ? anyM.image_url
                                          : anyM.image_url?.url;
                                  const url = fromImageUrl || anyM.url;
                                  if (url) {
                                      return {
                                          type: "image" as const,
                                          source: { type: "url" as const, url },
                                      };
                                  }
                              }
                              return { type: "text" as const, text: "[image omitted]" };
                          }),
            },
        ];

        const ctrl = new AbortController();
        this.startedAt = Date.now();
        this.activeClientRunId = `client-${this.startedAt}-${++this.turnSeq}`;
        let terminalSettled = false;
        const settleTurn = (success: boolean, error?: string): void => {
            if (terminalSettled || ctrl.signal.aborted) return;
            terminalSettled = true;
            this.enqueue({
                type: "result",
                success,
                error,
                durationMs: Date.now() - this.startedAt,
                conversationId: this._conversationId,
                clientRunId: this.activeClientRunId ?? undefined,
            } as SDKResultMessage & { clientRunId?: string });
        };

        // Detect the Letta CONFLICT response that fires when the conversation
        // has a pending tool approval. Recoverable: cancel the stuck runs and
        // retry the send once.
        const isApprovalConflictError = (msg: string): boolean => {
            return (
                /CONFLICT/i.test(msg) &&
                /(waiting for approval|pending approval|approval on a tool call)/i.test(msg)
            );
        };

        // Detect Letta's transient per-conversation single-flight guard.
        // This is not a bad tool result and not a stuck approval: it means a
        // previous background run is still finalizing server-side. Retrying a
        // little later is correct; surfacing this as a terminal session error
        // makes the UI look like the agent stopped whenever a user sends the
        // next message a few seconds too early.
        const isConversationBusyConflictError = (msg: string): boolean => {
            return (
                /\b409\b|CONFLICT/i.test(msg) &&
                /(another request|currently being processed|please wait for it to complete|run_id=run-|"run_id"\s*:)/i.test(msg)
            );
        };

        const extractBusyRunId = (msg: string): string | null => {
            const quoted = /"run_id"\s*:\s*"(run-[^"]+)"/i.exec(msg)?.[1];
            if (quoted) return quoted;
            return /run_id=(run-[a-z0-9-]+)/i.exec(msg)?.[1] ?? null;
        };

        // Detect transient network/socket failures mid-stream. Letta cloud's
        // SSE stream can be killed by intermediate proxies, idle timeouts, or
        // brief WAN blips — all recoverable by reconnecting. Covers undici
        // (`terminated` / `UND_ERR_SOCKET` / `other side closed`) and the
        // common Node net errors.
        const isTransientNetworkError = (err: unknown, msg: string): boolean => {
            if (/UND_ERR_SOCKET|other side closed|SocketError|^terminated$|stream pump failed/i.test(msg)) {
                return true;
            }
            if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EPIPE|EAI_AGAIN|socket hang up|network|fetch failed/i.test(msg)) {
                return true;
            }
            // Walk the cause chain — undici puts the real code on err.cause.code
            let cur: unknown = err;
            for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
                const e = cur as { code?: unknown; name?: unknown; cause?: unknown };
                if (typeof e.code === "string" && /UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|EPIPE|EAI_AGAIN/i.test(e.code)) {
                    return true;
                }
                if (typeof e.name === "string" && /SocketError/i.test(e.name)) {
                    return true;
                }
                cur = e.cause;
            }
            return false;
        };

        // Letta streams may emit stop_reason=error/llm_api_error and then the
        // SDK throws a generic APIError. The actionable fields are usually on
        // err.error.{error_type,detail}. Provider-side internal LLM errors are
        // transient; retry the stream instead of stopping the whole session.
        const isTransientLlmInternalError = (err: unknown, msg: string): boolean => {
            const parts = [msg];
            let cur: unknown = err;
            for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
                const e = cur as {
                    message?: unknown;
                    detail?: unknown;
                    error_type?: unknown;
                    stop_reason?: unknown;
                    error?: unknown;
                    cause?: unknown;
                };
                for (const value of [e.message, e.detail, e.error_type, e.stop_reason]) {
                    if (typeof value === "string") parts.push(value);
                }
                cur = e.error ?? e.cause;
            }
            const text = parts.join("\n");
            return (
                /\b(internal_error|llm_api_error)\b/i.test(text) ||
                /ChatGPT API error|error occurred during agent execution|error occurred while processing your request/i.test(text)
            );
        };

        // Background pump — multi-turn loop, fire-and-forget.
        // Wrapped in an outer retry loop so we can recover once from approval
        // conflicts that race past the pre-flight recoverStuckApprovals call.
        const pump = (async () => {
            // Each recoverable failure class owns an independent retry budget.
            // A provider error must not consume approval-conflict recovery (and
            // vice versa), otherwise a later stale approval is misclassified as
            // another generic internal LLM failure.
            const MAX_APPROVAL_CONFLICT_RECOVERIES = 2;
            let approvalConflictRecoveries = 0;
            // Network drops get their own (slightly larger) budget — these
            // are recoverable by reconnecting the SSE stream.
            const MAX_NETWORK_RETRIES = 4;
            let networkRetries = 0;
            const MAX_BUSY_RETRIES = 3;
            let busyRetries = 0;
            let didPreflightApprovalRecovery = false;
            const MAX_LLM_INTERNAL_RETRIES = 3;
            let llmInternalRetries = 0;

            // eslint-disable-next-line no-constant-condition
            while (true) {
                try {
                let nextMessages: unknown[] = initialMessages;
                let allowResponseStateReuseForNextTurn = false;
                let turnCount = 0;
                let terminalError: string | null = null;

                // Client-tool continuations are part of one logical user turn.
                // Do not manufacture a terminal result while the server still
                // owns that turn. Cancellation is the safety valve for a truly
                // runaway loop; a local numeric cap cannot safely release the
                // conversation lease.
                while (!ctrl.signal.aborted) {
                    turnCount++;

                    // Mirror letta-code's approval-conflict recovery: clear
                    // any prior stuck "requires_approval" runs before
                    // sending. Without this, the server returns CONFLICT
                    // and the conversation is permanently blocked.
                    //
                    // Pre-flight ONLY on the first turn of this pump.
                    // Mid-pump turns are driven by our own tool returns —
                    // anything pending there is live, not stale, so we
                    // must not deny it.
                    if (turnCount === 1 && !didPreflightApprovalRecovery) {
                        didPreflightApprovalRecovery = true;
                        await this.recoverStuckApprovals({ fast: true });
                    }
                    if (ctrl.signal.aborted) break;

                    const turnResult = await this.runOneStreamTurn(
                        nextMessages,
                        ctrl,
                        { allowResponseStateReuse: allowResponseStateReuseForNextTurn }
                    );
                    allowResponseStateReuseForNextTurn = false;
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
                            // Resource-aware scheduler: reads/searches
                            // fan out, writes to the same file_path
                            // serialize, Bash/global-effect tools hold
                            // a global lock. See subagents/parallelism.
                            const executed = await runWithResourceLocks(
                                turnResult.approvalRequests,
                                (req) => req.toolName,
                                (req) => parseToolArgs(req.argumentsRaw),
                                async (req) => {
                                    const args = parseToolArgs(req.argumentsRaw);
                                    if (!isClientTool(req.toolName)) {
                                        return {
                                            tool_call_id: req.toolCallId,
                                            tool_return: `Client tool '${req.toolName}' is not registered on this device.`,
                                            status: "error" as const,
                                        };
                                    }
                                    // Plan-mode permission gate — block
                                    // write/destructive tools while in
                                    // plan mode before they execute.
                                    const planCheck = this.planMode.checkPermission(
                                        req.toolName,
                                        args as Record<string, unknown>
                                    );
                                    if (planCheck.decision === "deny") {
                                        const denyMsg =
                                            planCheck.reason ??
                                            `Permission mode: ${this.planMode.getMode()}`;
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
                                            content: denyMsg,
                                            isError: true,
                                            uuid: `tool-result-${req.toolCallId}`,
                                        } as unknown as SDKToolResultMessage);
                                        return {
                                            tool_call_id: req.toolCallId,
                                            tool_return: denyMsg,
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
                                            planMode: this.planMode,
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
                                }
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
                        // Letta Code v0.27.4 reuses the previous response id only
                        // for client-handled approval continuations. This avoids a
                        // full server re-run after auto-approved tool execution while
                        // keeping normal user turns on the full path.
                        allowResponseStateReuseForNextTurn = true;
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
                        await this.recoverStuckApprovals({ fast: false });
                        // Surface a friendly notice in the chat so the
                        // user knows what happened.
                        terminalError =
                            "The agent attempted a tool that isn't enabled on this agent. The pending approval has been cleared. To unlock device tools (Bash, Skill, file ops), migrate this agent to letta_v1_agent — see README.";
                        this.enqueue({
                            type: "error",
                            message: terminalError,
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
                    const toolReturns = await runWithResourceLocks(
                        clientCalls,
                        (call) => call.name,
                        (call) => parseToolArgs(call.argumentsRaw),
                        async (call) => {
                            const args = parseToolArgs(call.argumentsRaw);
                            // Plan-mode gate (Branch 3 — no approval path).
                            const planCheck = this.planMode.checkPermission(
                                call.name,
                                args as Record<string, unknown>
                            );
                            if (planCheck.decision === "deny") {
                                const denyMsg =
                                    planCheck.reason ??
                                    `Permission mode: ${this.planMode.getMode()}`;
                                this.enqueue({
                                    type: "tool_result",
                                    toolCallId: call.toolCallId,
                                    content: denyMsg,
                                    isError: true,
                                    uuid: `tool-result-${call.toolCallId}`,
                                } as unknown as SDKToolResultMessage);
                                return {
                                    tool_call_id: call.toolCallId,
                                    tool_return: denyMsg,
                                    status: "error" as const,
                                } satisfies ToolReturn;
                            }
                            const result = await runClientTool(
                                call.name,
                                args,
                                {
                                    signal: ctrl.signal,
                                    agentId: this._agentId ?? undefined,
                                    conversationId:
                                        this._conversationId ?? undefined,
                                    planMode: this.planMode,
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
                        }
                    );

                    if (ctrl.signal.aborted) break;
                    nextMessages = [{ tool_returns: toolReturns }];
                }

                if (ctrl.signal.aborted) return;

                // Exact-once terminal for the logical user turn. A recovered
                // approval failure is not success; normal completion is.
                settleTurn(terminalError === null, terminalError ?? undefined);
                // Successful pump — break the retry loop.
                break;
            } catch (err) {
                if (ctrl.signal.aborted) {
                    this.activePumps.delete(ctrl);
                    return;
                }
                const errMessage =
                    err instanceof Error ? err.message : String(err);

                // Approval conflicts are their own error class. Do not let the
                // generic `internal_error` wrapper route them through the LLM
                // retry budget: the conflict cannot clear without submitting a
                // denial for the pending approval.
                if (isApprovalConflictError(errMessage)) {
                    if (
                        approvalConflictRecoveries <
                        MAX_APPROVAL_CONFLICT_RECOVERIES
                    ) {
                        approvalConflictRecoveries++;
                        console.warn(
                            `[WsSession] approval conflict; recovering and retrying (${approvalConflictRecoveries}/${MAX_APPROVAL_CONFLICT_RECOVERIES}):`,
                            errMessage
                        );
                        await this.recoverStuckApprovals({ fast: false });
                        // Loop back and retry the pump from scratch.
                        continue;
                    }

                    console.error(
                        `[WsSession] approval conflict remained after ${approvalConflictRecoveries} recovery attempts:`,
                        errMessage
                    );
                    this.enqueue({
                        type: "error",
                        message: errMessage,
                    } as SDKErrorMessage);
                    settleTurn(false, errMessage);
                    break;
                }

                if (
                    isConversationBusyConflictError(errMessage) &&
                    busyRetries < MAX_BUSY_RETRIES
                ) {
                    busyRetries++;
                    const busyRunId = extractBusyRunId(errMessage);
                    if (busyRunId) {
                        console.warn(
                            `[WsSession] conversation is owned by ${busyRunId}; waiting for it to settle before retry ${busyRetries}/${MAX_BUSY_RETRIES}`
                        );
                        const settled = await this.waitForRunToSettle(
                            busyRunId,
                            ctrl.signal
                        );
                        if (!settled && !ctrl.signal.aborted) {
                            throw new Error(
                                `Conversation remained busy on ${busyRunId} after waiting for settlement`
                            );
                        }
                    } else {
                        const backoffMs = Math.min(
                            5_000,
                            1000 + busyRetries * 1000
                        );
                        console.warn(
                            `[WsSession] conversation busy conflict without run id (retry ${busyRetries}/${MAX_BUSY_RETRIES} in ${backoffMs}ms):`,
                            errMessage
                        );
                        await this.sleepWithAbort(backoffMs, ctrl.signal);
                    }
                    if (ctrl.signal.aborted) {
                        this.activePumps.delete(ctrl);
                        return;
                    }
                    continue;
                }

                // Provider-side internal LLM failure — reconnect with a
                // bounded exponential backoff. This covers Letta APIError
                // payloads like error_type=internal_error and stream
                // stop_reason=llm_api_error.
                if (
                    isTransientLlmInternalError(err, errMessage) &&
                    llmInternalRetries < MAX_LLM_INTERNAL_RETRIES
                ) {
                    llmInternalRetries++;
                    const backoffMs = Math.min(30_000, 5_000 * 2 ** (llmInternalRetries - 1));
                    console.warn(
                        `[WsSession] transient LLM internal error (retry ${llmInternalRetries}/${MAX_LLM_INTERNAL_RETRIES} in ${backoffMs}ms):`,
                        errMessage
                    );
                    await this.sleepWithAbort(backoffMs, ctrl.signal);
                    if (ctrl.signal.aborted) {
                        this.activePumps.delete(ctrl);
                        return;
                    }
                    continue;
                }

                // Transient network drop mid-stream — reconnect with backoff.
                // Letta's SSE can be cut by proxies/idle timeouts; the run is
                // typically still progressing server-side, so a fresh pump
                // either picks up trailing events or rerun cleanly.
                if (
                    isTransientNetworkError(err, errMessage) &&
                    networkRetries < MAX_NETWORK_RETRIES
                ) {
                    networkRetries++;
                    const backoffMs = Math.min(15_000, 1000 * 2 ** (networkRetries - 1));
                    console.warn(
                        `[WsSession] transient network error (retry ${networkRetries}/${MAX_NETWORK_RETRIES} in ${backoffMs}ms):`,
                        errMessage
                    );
                    await this.sleepWithAbort(backoffMs, ctrl.signal);
                    if (ctrl.signal.aborted) {
                        this.activePumps.delete(ctrl);
                        return;
                    }
                    continue;
                }

                console.error("[WsSession] stream pump failed:", err);
                this.enqueue({
                    type: "error",
                    message: errMessage,
                } as SDKErrorMessage);
                settleTurn(false, errMessage);
                break;
                }
            } // end retry while-loop
        })();

        this.activePumps.set(ctrl, pump);
        void pump
            .catch((err) => {
                if (ctrl.signal.aborted || terminalSettled) return;
                const errMessage = err instanceof Error ? err.message : String(err);
                console.error("[WsSession] unexpected pump failure:", err);
                this.enqueue({
                    type: "error",
                    message: errMessage,
                } as SDKErrorMessage);
                settleTurn(false, errMessage);
            })
            .finally(() => {
                this.activePumps.delete(ctrl);
                this.finishStream();
            });
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
    private async recoverStuckApprovals(options: { fast?: boolean } = {}): Promise<void> {
        if (!this._agentId || !this._conversationId) return;
        try {
            await clearPendingApprovals(
                getClient(),
                this._conversationId,
                options.fast === false ? { drainTimeoutMs: 15_000 } : { drainTimeoutMs: 2_000 }
            );
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
        ctrl: AbortController,
        options: { allowResponseStateReuse?: boolean } = {}
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
        const previousResponseId =
            options.allowResponseStateReuse === true ? this.responseStateId : null;
        const headers: Record<string, string> = {};
        if (previousResponseId) {
            headers[RESPONSE_STATE_HEADER] =
                encodeResponseStateHeader(previousResponseId);
            this.responseStateId = null;
            debug("WsSession: sending response-state approval continuation", {
                conversationId,
            });
        } else if (options.allowResponseStateReuse !== true) {
            this.responseStateId = null;
        }
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
                        body: Record<string, unknown>,
                        options?: {
                            headers?: Record<string, string>;
                            signal?: AbortSignal;
                        }
                    ) => Promise<Stream<LettaStreamingResponse>>;
                };
            }
        ).messages.create(
            conversationId,
            {
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
            },
            {
                ...(Object.keys(headers).length > 0 ? { headers } : {}),
                signal: ctrl.signal,
            }
        )) as Stream<LettaStreamingResponse>;

        for await (const event of stream as AsyncIterable<LettaStreamingResponse>) {
            if (ctrl.signal.aborted) break;
            this.handleStreamingEvent(event);

            // Track tool_call_messages so we can dispatch after the
            // stream ends. arguments arrive in fragments — concat.
            const e = event as unknown as Record<string, unknown>;
            const messageType = String(e.message_type ?? "");
            if (typeof e.run_id === "string" && e.run_id) {
                this.activeServerRunIds.add(e.run_id);
            }
            const responseStateId = getResponseStateId(event);
            if (responseStateId) {
                this.responseStateId = responseStateId;
                debug("WsSession: captured response-state id", {
                    conversationId,
                });
            }
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
        await this.abort();
    }

    /**
     * End local consumption and cancel the matching server-side conversation.
     * The returned promise settles only after local pumps have released their
     * lease, so callers must not start a replacement turn before it resolves.
     */
    async abort(): Promise<void> {
        const pumps = Array.from(this.activePumps.entries());
        for (const [ctrl] of pumps) ctrl.abort();

        await Promise.allSettled([
            this.cancelServerWork(),
            ...pumps.map(([, pump]) => pump),
        ]);
        this.finishStream();
    }

    close(): void {
        void this.abort();
    }

    private finishStream(): void {
        if (this.streamClosed) return;
        this.streamClosed = true;
        for (const resolve of this.streamResolvers) resolve(null);
        this.streamResolvers = [];
    }

    private async sleepWithAbort(
        delayMs: number,
        signal: AbortSignal
    ): Promise<void> {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => {
            const timer = setTimeout(done, delayMs);
            const onAbort = () => done();
            function done(): void {
                clearTimeout(timer);
                signal.removeEventListener("abort", onAbort);
                resolve();
            }
            signal.addEventListener("abort", onAbort, { once: true });
        });
    }

    private async waitForRunToSettle(
        runId: string,
        signal: AbortSignal,
        timeoutMs = 5 * 60_000
    ): Promise<boolean> {
        const client = getClient() as unknown as {
            runs?: {
                retrieve?: (id: string) => Promise<{ status?: string }>;
            };
        };
        if (!client.runs?.retrieve) return false;

        const terminal = new Set([
            "completed",
            "failed",
            "cancelled",
            "canceled",
            "expired",
        ]);
        const deadline = Date.now() + timeoutMs;
        while (!signal.aborted && Date.now() < deadline) {
            const run = await client.runs.retrieve(runId).catch(() => undefined);
            const status = String(run?.status ?? "unknown").toLowerCase();
            if (terminal.has(status)) return true;
            await this.sleepWithAbort(1_000, signal);
        }
        return false;
    }

    private async cancelServerWork(): Promise<void> {
        if (!this._conversationId) return;
        const client = getClient() as unknown as {
            conversations?: {
                cancel?: (id: string) => Promise<unknown>;
            };
            runs?: {
                retrieve?: (id: string) => Promise<{ status?: string }>;
                cancel?: (id: string) => Promise<unknown>;
            };
        };

        await client.conversations?.cancel?.(this._conversationId).catch((err) => {
            debug("WsSession: conversations.cancel failed", {
                conversationId: this._conversationId,
                error: err instanceof Error ? err.message : String(err),
            });
        });

        const terminal = new Set([
            "completed",
            "failed",
            "cancelled",
            "canceled",
            "expired",
        ]);
        await Promise.allSettled(
            Array.from(this.activeServerRunIds).map(async (runId) => {
                const run = await client.runs?.retrieve?.(runId).catch(() => undefined);
                const status = String(run?.status ?? "unknown").toLowerCase();
                if (!terminal.has(status)) {
                    await client.runs?.cancel?.(runId);
                }
            })
        );
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
        const stamped = this.activeClientRunId
            ? ({ ...((msg as unknown) as Record<string, unknown>), clientRunId: this.activeClientRunId } as unknown as SDKMessage)
            : msg;
        if (this.streamResolvers.length > 0) {
            const resolve = this.streamResolvers.shift();
            if (resolve) {
                resolve(stamped);
                return;
            }
        }
        this.streamQueue.push(stamped);
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
                // mid tool-execution. Only the outer pump in send() emits
                // the single terminal result for the whole
                // user turn.
                //
                // We still log so the trace stays useful for debugging.
                debug("WsSession: intermediate stop_reason", {
                    stopReason: String(e.stop_reason ?? ""),
                });
                return;
            }
            case "letta_ping":
            case "ping":
                return;
            case "response_state":
                // Letta Code v0.27.4 streams response-state cache markers for
                // approval-continuation optimization. We capture them in
                // runOneStreamTurn; they must stay hidden from UI/history.
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
