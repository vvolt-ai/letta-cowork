/**
 * Shared types for the client_tools framework.
 *
 * A "client tool" is a function the agent can call mid-turn whose
 * execution happens on the user's machine (here, Electron's main
 * process) rather than on Letta Cloud. The agent emits a
 * tool_call_message; we execute; we send a tool_return back.
 */

/** JSON Schema parameter spec, the format Letta's `client_tools` array expects. */
export type JsonSchema = Record<string, unknown>;

/** A tool definition the framework registers and exposes via client_tools. */
export interface ClientToolDefinition {
    /** Tool name. Must match what the agent calls. */
    name: string;
    /** Human description used by the model to decide when to call it. */
    description: string;
    /** JSON Schema for the function's parameters. */
    parameters: JsonSchema;
    /** Executor — receives parsed args, returns a textual result. */
    run: (args: Record<string, unknown>, ctx: ToolRunContext) => Promise<ToolRunResult>;
}

export interface ToolRunContext {
    /** Cancellation signal — runners should bail out promptly. */
    signal: AbortSignal;
    /** Conversation/agent scope, in case a runner wants to log/route on it. */
    agentId?: string;
    conversationId?: string;
    /**
     * Authenticated per-user runtime secrets for this tool invocation.
     * Values are process-memory-only and must never be logged or persisted.
     */
    runtimeEnv?: Readonly<Record<string, string>>;
    /**
     * Per-session plan-mode manager. Threaded through so plan tools
     * can mutate per-session state without a global singleton.
     * Typed as `unknown` to avoid a circular import — narrow at usage.
     */
    planMode?: unknown;
}

export interface ToolRunResult {
    /** Concatenated text returned to the agent. */
    output: string;
    /** True if the tool failed — surfaces as `is_error: true` to the agent. */
    isError: boolean;
}

/** Shape we hand to messages.create's `client_tools` parameter. */
export interface ClientToolWireDef {
    name: string;
    description: string;
    parameters: JsonSchema;
}
