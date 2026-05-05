/**
 * Registration manifest for the cowork-gui-cloned tool set.
 *
 * Each entry binds:
 *   • the tool name the agent will call (matches letta-code exactly)
 *   • the JSON-Schema parameter spec (read from _shared/schemas/*.json)
 *   • the markdown description (read from _shared/descriptions/*.md)
 *   • the impl function (imported from ./<Tool>.ts)
 *
 * Each impl returns a tool-specific shape (Edit returns
 * {message, replacements}, Read returns {content: string|array}, etc.).
 * `adaptResult()` normalises any of those into our framework's
 * {output, isError} shape so they fit the existing wire layer in
 * session.ts.
 */

import type {
    ClientToolDefinition,
    ToolRunResult,
} from "../../types.js";

import ApplyPatchSchema from "../_shared/schemas/ApplyPatch.json" with { type: "json" };
import AskUserQuestionSchema from "../_shared/schemas/AskUserQuestion.json" with { type: "json" };
import BashOutputSchema from "../_shared/schemas/BashOutput.json" with { type: "json" };
import EditSchema from "../_shared/schemas/Edit.json" with { type: "json" };
import GlobSchema from "../_shared/schemas/Glob.json" with { type: "json" };
import GrepSchema from "../_shared/schemas/Grep.json" with { type: "json" };
import KillBashSchema from "../_shared/schemas/KillBash.json" with { type: "json" };
import LSSchema from "../_shared/schemas/LS.json" with { type: "json" };
import MultiEditSchema from "../_shared/schemas/MultiEdit.json" with { type: "json" };
import ReadSchema from "../_shared/schemas/Read.json" with { type: "json" };
import ReadLSPSchema from "../_shared/schemas/ReadLSP.json" with { type: "json" };
import TaskOutputSchema from "../_shared/schemas/TaskOutput.json" with { type: "json" };
import TaskStopSchema from "../_shared/schemas/TaskStop.json" with { type: "json" };
import TodoWriteSchema from "../_shared/schemas/TodoWrite.json" with { type: "json" };
import ViewImageSchema from "../_shared/schemas/ViewImage.json" with { type: "json" };
import WriteSchema from "../_shared/schemas/Write.json" with { type: "json" };

import { apply_patch } from "./ApplyPatch.js";
import { ask_user_question } from "./AskUserQuestion.js";
import { bash_output } from "./BashOutput.js";
import { edit } from "./Edit.js";
import { glob } from "./Glob.js";
import { grep } from "./Grep.js";
import { kill_bash } from "./KillBash.js";
import { ls } from "./LS.js";
import { multi_edit } from "./MultiEdit.js";
import { read } from "./Read.js";
import { read_lsp } from "./ReadLSP.js";
import { task_output } from "./TaskOutput.js";
import { task_stop } from "./TaskStop.js";
import { todo_write } from "./TodoWrite.js";
import { view_image } from "./ViewImage.js";
import { write } from "./Write.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const descDir = join(__dirname, "..", "_shared", "descriptions");
function loadDesc(name: string): string {
    try {
        return readFileSync(join(descDir, `${name}.md`), "utf-8");
    } catch {
        return name; // fallback to bare name if file missing
    }
}
const ApplyPatchDescription = loadDesc("ApplyPatch");
const AskUserQuestionDescription = loadDesc("AskUserQuestion");
const BashOutputDescription = loadDesc("BashOutput");
const EditDescription = loadDesc("Edit");
const GlobDescription = loadDesc("Glob");
const GrepDescription = loadDesc("Grep");
const KillBashDescription = loadDesc("KillBash");
const LSDescription = loadDesc("LS");
const MultiEditDescription = loadDesc("MultiEdit");
const ReadDescription = loadDesc("Read");
const ReadLSPDescription = loadDesc("ReadLSP");
const TaskOutputDescription = loadDesc("TaskOutput");
const TaskStopDescription = loadDesc("TaskStop");
const TodoWriteDescription = loadDesc("TodoWrite");
const ViewImageDescription = loadDesc("ViewImage");
const WriteDescription = loadDesc("Write");

type ImplFn = (args: Record<string, unknown>) => Promise<unknown>;

/**
 * Convert any tool function's typed return to our {output,isError}.
 * The cowork-gui tools mostly throw on error and return a typed object on
 * success. A few return `{content: [{type:"text", text}], status}` (Bash,
 * AskUserQuestion). Read returns `{content: string | Array<…>}`.
 */
function adaptResult(raw: unknown): ToolRunResult {
    if (raw && typeof raw === "object") {
        const r = raw as Record<string, unknown>;
        // Bash-style {content:[{type,text}], status}
        if (Array.isArray(r.content)) {
            const text = (r.content as Array<unknown>)
                .map((p) => {
                    if (p && typeof p === "object") {
                        const block = p as Record<string, unknown>;
                        if (block.type === "text" && typeof block.text === "string") {
                            return block.text;
                        }
                        if (block.type === "image") {
                            return `[Image content omitted from text result]`;
                        }
                    }
                    return "";
                })
                .filter(Boolean)
                .join("\n");
            return {
                output: text,
                isError: r.status === "error",
            };
        }
        // Read-style {content: string}
        if (typeof r.content === "string") {
            return { output: r.content, isError: false };
        }
        // Edit-style {message, replacements?}
        if (typeof r.message === "string") {
            return { output: r.message, isError: false };
        }
        // Glob/Grep/LS — try common shapes
        if (typeof r.text === "string") {
            return { output: r.text, isError: false };
        }
        // Fallback: JSON-stringify
        try {
            return { output: JSON.stringify(r, null, 2), isError: false };
        } catch {
            return { output: String(r), isError: false };
        }
    }
    if (typeof raw === "string") return { output: raw, isError: false };
    return { output: String(raw ?? ""), isError: false };
}

function makeTool(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    impl: ImplFn
): ClientToolDefinition {
    return {
        name,
        description: description.trim(),
        parameters,
        run: async (args, ctx) => {
            try {
                const out = await impl({
                    ...args,
                    signal: ctx.signal,
                });
                return adaptResult(out);
            } catch (err) {
                return {
                    output:
                        err instanceof Error
                            ? err.stack ?? err.message
                            : String(err),
                    isError: true,
                };
            }
        },
    };
}

export const lettaCodeTools: ClientToolDefinition[] = [
    makeTool("Read", ReadDescription, ReadSchema as Record<string, unknown>, read as unknown as ImplFn),
    makeTool("Write", WriteDescription, WriteSchema as Record<string, unknown>, write as unknown as ImplFn),
    makeTool("Edit", EditDescription, EditSchema as Record<string, unknown>, edit as unknown as ImplFn),
    makeTool("MultiEdit", MultiEditDescription, MultiEditSchema as Record<string, unknown>, multi_edit as unknown as ImplFn),
    makeTool("Glob", GlobDescription, GlobSchema as Record<string, unknown>, glob as unknown as ImplFn),
    makeTool("Grep", GrepDescription, GrepSchema as Record<string, unknown>, grep as unknown as ImplFn),
    makeTool("LS", LSDescription, LSSchema as Record<string, unknown>, ls as unknown as ImplFn),
    makeTool("ApplyPatch", ApplyPatchDescription, ApplyPatchSchema as Record<string, unknown>, apply_patch as unknown as ImplFn),
    makeTool("TodoWrite", TodoWriteDescription, TodoWriteSchema as Record<string, unknown>, todo_write as unknown as ImplFn),
    makeTool("AskUserQuestion", AskUserQuestionDescription, AskUserQuestionSchema as Record<string, unknown>, ask_user_question as unknown as ImplFn),
    makeTool("BashOutput", BashOutputDescription, BashOutputSchema as Record<string, unknown>, bash_output as unknown as ImplFn),
    makeTool("KillBash", KillBashDescription, KillBashSchema as Record<string, unknown>, kill_bash as unknown as ImplFn),
    makeTool("ViewImage", ViewImageDescription, ViewImageSchema as Record<string, unknown>, view_image as unknown as ImplFn),
    makeTool("TaskOutput", TaskOutputDescription, TaskOutputSchema as Record<string, unknown>, task_output as unknown as ImplFn),
    makeTool("TaskStop", TaskStopDescription, TaskStopSchema as Record<string, unknown>, task_stop as unknown as ImplFn),
    makeTool("ReadLSP", ReadLSPDescription, ReadLSPSchema as Record<string, unknown>, read_lsp as unknown as ImplFn),
];
