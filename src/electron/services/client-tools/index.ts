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
import { lettaCodeTools } from "./runners/letta_tools/index.js";
import { listSkillsTool, skillTool } from "./runners/skill.js";
import { productivityTools } from "./runners/productivity.js";
import { emitExtensionToolStart } from "../extensions/extension-events.js";
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

export function registerClientTool(def: ClientToolDefinition): void {
    register(def);
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
    const def = registry.get(name);
    if (!def) {
        return {
            output: `Client tool '${name}' is not registered on this device.`,
            isError: true,
        };
    }
    try {
        const toolStartResult = await emitExtensionToolStart({
            agentId: ctx.agentId,
            conversationId: ctx.conversationId,
            toolName: name,
            args,
            context: ctx,
        });
        if (toolStartResult.deny) {
            return {
                output: toolStartResult.reason || `Client tool '${name}' was denied by an extension.`,
                isError: true,
            };
        }

        return await def.run(toolStartResult.args ?? args, ctx);
    } catch (err) {
        return {
            output: `Client tool '${name}' threw: ${
                err instanceof Error ? err.stack ?? err.message : String(err)
            }`,
            isError: true,
        };
    }
}

export type {
    ClientToolDefinition,
    ClientToolWireDef,
    ToolRunContext,
    ToolRunResult,
} from "./types.js";
