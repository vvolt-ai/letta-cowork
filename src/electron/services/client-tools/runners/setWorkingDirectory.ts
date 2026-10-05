import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { ClientToolDefinition } from "../types.js";
import { getRuntimeContext } from "./_shared/runtime-context.js";

export const setWorkingDirectoryTool: ClientToolDefinition = {
    name: "SetWorkingDirectory",
    description: "Change this session's working directory for later tool calls without changing the process CWD. Relative paths resolve from the current trusted directory. Does not change branches, credentials, or another session. Project instructions/skills refresh at their next session discovery boundary.",
    parameters: { type: "object", properties: { path: { type: "string", minLength: 1 } }, required: ["path"], additionalProperties: false },
    run: async (args, ctx) => {
        try {
            if (!ctx.setWorkingDirectory || !ctx.workingDirectory) throw new Error("This execution route does not support owned directory switching.");
            if (ctx.workingDirectoryOwnerConversationId && ctx.workingDirectoryOwnerConversationId !== ctx.conversationId) throw new Error("Inherited parent directory setter cannot be used by a child conversation.");
            if (typeof args.path !== "string" || !args.path.trim() || args.path.includes("\0")) throw new Error("Provide a valid directory path.");
            const input = args.path.trim();
            const expanded = input === "~" ? homedir() : /^~[\\/]/.test(input) ? resolve(homedir(), input.slice(2)) : input;
            const directory = resolve(ctx.workingDirectory, expanded);
            if (!(await stat(directory)).isDirectory()) throw new Error("Requested path is not a directory.");
            await ctx.setWorkingDirectory(directory);
            const current = getRuntimeContext();
            if (current) current.workingDirectory = directory;
            return { output: JSON.stringify({ working_directory: directory, changed: true, processCwdChanged: false }), isError: false };
        } catch (error) { return { output: error instanceof Error ? error.message : String(error), isError: true }; }
    },
};
