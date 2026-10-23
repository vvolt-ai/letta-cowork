/**
 * Task — spawn a subagent to handle a complex multi-step task.
 *
 * Schema mirrors letta-code's tools/schemas/Task.json verbatim. We only
 * implement Option A from the design (block-and-return, no background
 * mode). The subagent inherits the parent's agent identity (and thus
 * the full client_tools list — Bash, Read, Edit, Glob, Grep, etc.),
 * but runs in a FRESH conversation so it gets its own context window.
 *
 * Inputs (per the schema):
 *   • description    — short (3–5 words), used for logging
 *   • prompt         — the task body
 *   • subagent_type  — currently informational; treated like a tag.
 *                      All subagent_types share the parent agent today.
 *   • agent_id       — deploy a specific agent instead of inheriting
 *   • conversation_id — resume an existing subagent session
 *   • run_in_background — IGNORED in this build (Option C deferred)
 */

import type { Letta } from "@letta-ai/letta-client";

import {
    runSubagent,
    type RunSubagentResult,
} from "../../../agent/subagents/manager.js";
import type { ToolRunContext } from "../../types.js";
import { validateRequiredParams } from "../_shared/validation.js";

interface TaskArgs {
    description: string;
    prompt: string;
    subagent_type: string;
    run_in_background?: boolean;
    agent_id?: string;
    conversation_id?: string;
    signal?: AbortSignal;
    /** Threaded by the framework's makeTool wrapper — the parent's agent id. */
    _runtime_agent_id?: string;
    /** Threaded by the framework's makeTool wrapper — the parent conversation id. */
    _runtime_conversation_id?: string;
    /** Trusted account-scoped client from the parent Cowork turn. */
    _runtime_letta_client?: unknown;
    /** Trusted parent tool context inherited by the child conversation. */
    _runtime_tool_context?: ToolRunContext;
}

interface TaskResult {
    content: Array<{ type: string; text: string }>;
    status: "success" | "error";
}

export function getTaskClient(runtimeClient?: unknown): Letta {
    if (runtimeClient) return runtimeClient as Letta;
    throw new Error('SDK_SUBAGENT_SCOPE_UNAVAILABLE: no active parent account client; no ambient fallback was attempted.');
}

export async function task(args: TaskArgs): Promise<TaskResult> {
    validateRequiredParams(
        args,
        ["description", "prompt", "subagent_type"],
        "Task"
    );

    if (args.run_in_background) {
        return {
            content: [
                {
                    type: "text",
                    text: "run_in_background is not supported in this build — the Task tool blocks until the subagent finishes. Run the task synchronously.",
                },
            ],
            status: "error",
        };
    }

    const parentAgentId =
        args._runtime_agent_id || "";
    if (!args.agent_id && !args.conversation_id && !parentAgentId) {
        return {
            content: [
                {
                    type: "text",
                    text: "Task: no active SDK agent context. Start delegation from its parent Cowork session.",
                },
            ],
            status: "error",
        };
    }

    const signal = args.signal ?? new AbortController().signal;
    const client = getTaskClient(args._runtime_letta_client);

    let result: RunSubagentResult;
    try {
        result = await runSubagent(client, {
            parentAgentId,
            prompt: args.prompt,
            description: args.description,
            agentId: args.agent_id,
            conversationId: args.conversation_id,
            signal,
            toolContext: args._runtime_tool_context,
        });
    } catch (err) {
        return {
            content: [
                {
                    type: "text",
                    text: `Task failed: ${err instanceof Error ? err.message : String(err)}`,
                },
            ],
            status: "error",
        };
    }

    // Return a summary that mirrors letta-code's Task return shape.
    const summary =
        `Subagent: ${args.subagent_type} — ${args.description}\n` +
        `Conversation: ${result.conversationId}\n` +
        `Turns: ${result.turnCount}, tool calls: ${result.toolCallCount}, ${result.durationMs} ms\n\n` +
        `${result.finalText}`;

    return {
        content: [{ type: "text", text: summary }],
        status: "success",
    };
}
