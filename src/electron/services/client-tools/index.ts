/**
 * Client-tools framework — registers locally-executable tools and
 * exposes them in the shape Letta's `client_tools` parameter expects.
 *
 * Public API:
 *   • getClientToolsForWire()   — array to pass into messages.create
 *   • isClientTool(name)        — does this tool name belong to us?
 *   • runClientTool(name, args) — execute by name
 *   • registerClientTool(def)   — add new tool at runtime (for tests / extensions)
 */

import { bashTool } from "./runners/bash.js";
import { browserTools } from "./runners/browser.js";
import { codingTools } from "./runners/coding.js";
import { lettaCodeTools } from "./runners/letta_tools/index.js";
import { odooMcpTools } from "./runners/odooMcp.js";
import { productivityTools } from "./runners/productivity.js";
import { listSkillsTool, skillTool } from "./runners/skill.js";
import { appendToolTrace, runTimelineTool, toolTraceSearchTool } from "./runners/tool-traces.js";
import { veraMcpTools } from "./runners/veraMcp.js";
import { emitExtensionToolStart } from "../extensions/extension-events.js";

import type { ToolTraceStatus } from "./runners/tool-traces.js";
import type {
    ClientToolDefinition,
    ClientToolWireDef,
    ToolRunContext,
    ToolRunResult,
} from "./types.js";

const registry = new Map<string, ClientToolDefinition>();

function register(def: ClientToolDefinition): void {
    registry.set(def.name, def);
}

// Faithful port of letta-code's tool set (cowork-gui src/tools/impl/*).
// Schemas + descriptions + impls are the actual files copied from
// cowork-gui — not reimplementations. The `letta_tools/index.ts` adapter
// converts each tool's typed result to our {output,isError} shape.
//
// Currently registered:
//   • Bash (our v9 port — full launcher chain + ENV prelude)
//   • Read, Write, Edit, MultiEdit, Glob, Grep, LS — file ops
//   • ApplyPatch — codex-style unified-diff patches
//   • TodoWrite, AskUserQuestion — workflow
//   • Skill, list_skills — kept from our earlier impl
//   • ProjectContext, Git, LogTail, WebFetch, MemoryNotes, UserPreferences, Reminders — Cowork productivity tools
//   • ProjectDetect, ProjectMap, CodeEdit, CodeApplyPatch, ProjectRunScript, ProjectMemory*, LivePatch*, GitChangedByAgent, GitDiffSummary, LogSearch, ToolTraceSearch, RunTimeline — Cowork coding workflow tools
//   • BrowserNavigate, BrowserSnapshot, BrowserClick, BrowserType, BrowserWaitFor, BrowserTakeScreenshot, BrowserConsoleMessages, BrowserNetworkRequests, BrowserClose — built-in Playwright browser automation
//
// Deferred (need agent runtime / memory subsystem / UI hooks):
//   BashOutput, KillBash, EnterPlanMode, ExitPlanMode,
//   Task/TaskOutput/TaskStop, ViewImage, Memory/MemoryApplyPatch,
//   MessageChannel, ReadLSP.
register(bashTool);
for (const tool of lettaCodeTools) register(tool);
register(skillTool);
register(listSkillsTool);
for (const tool of productivityTools) register(tool);
for (const tool of codingTools) register(tool);
for (const tool of odooMcpTools) register(tool);
for (const tool of veraMcpTools) register(tool);
for (const tool of browserTools) register(tool);
register(toolTraceSearchTool);
register(runTimelineTool);

export function registerClientTool(def: ClientToolDefinition): () => void {
    if (registry.has(def.name)) {
        throw new Error(`Client tool '${def.name}' is already registered.`);
    }

    registry.set(def.name, def);
    return () => {
        // Only remove the exact registration that created this disposer. This
        // prevents a stale extension cleanup from deleting a newer tool.
        if (registry.get(def.name) === def) {
            registry.delete(def.name);
        }
    };
}

export function isClientTool(name: string): boolean {
    return registry.has(name);
}

export function getClientToolsForWire(): ClientToolWireDef[] {
    return Array.from(registry.values()).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
    }));
}

export async function runClientTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolRunContext
): Promise<ToolRunResult> {
    const startedAt = new Date();
    const def = registry.get(name);
    let argsToRun = args;
    let status: ToolTraceStatus = "error";
    let result: ToolRunResult;

    if (!def) {
        result = {
            output: `Client tool '${name}' is not registered on this device.`,
            isError: true,
        };
    } else {
        try {
            const toolStartResult = await emitExtensionToolStart({
                agentId: ctx.agentId,
                conversationId: ctx.conversationId,
                toolName: name,
                args,
                context: ctx,
            });
            argsToRun = toolStartResult.args ?? args;
            if (toolStartResult.deny) {
                status = "denied";
                result = {
                    output:
                        toolStartResult.reason ||
                        `Client tool '${name}' was denied by an extension.`,
                    isError: true,
                };
            } else {
                result = await def.run(argsToRun, ctx);
                status = result.isError ? "error" : "success";
            }
        } catch (err) {
            result = {
                output: `Client tool '${name}' threw: ${
                    err instanceof Error ? err.stack ?? err.message : String(err)
                }`,
                isError: true,
            };
        }
    }

    try {
        await appendToolTrace({
            toolName: name,
            status,
            startedAt,
            args: argsToRun,
            result,
            context: ctx,
        });
    } catch (error) {
        // Observability must never change the outcome of the tool being observed.
        console.warn("[client-tools] Failed to persist tool trace", error);
    }
    return result;
}

export type {
    ClientToolDefinition,
    ClientToolWireDef,
    ToolRunContext,
    ToolRunResult,
} from "./types.js";
