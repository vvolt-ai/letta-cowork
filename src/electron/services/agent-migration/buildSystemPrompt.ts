/**
 * Builds the letta-code system prompt that establishes the agent as a
 * coding agent with access to tools, subagents, and memory.
 *
 * Without this prompt the model literally has no instruction in its
 * persona saying "you can call Bash/Read/Edit/etc.", so the runtime
 * `client_tools` parameter never gets exercised.
 *
 * Mirrors the latest letta-code (`@letta-ai/letta-code` v0.25+):
 *   • src/agent/promptAssets.ts → buildSystemPrompt(presetId, memoryMode)
 *   • src/agent/prompts/letta_no_memfs.md   ← "standard" memory mode (DEFAULT)
 *   • src/agent/prompts/letta.md            ← "memfs"     memory mode (variant)
 *
 * Letta-code consolidated the "core prompt + memory addon" structure
 * into two self-contained files. We keep the same shape here.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, "prompts");

/** Letta-code's MemoryPromptMode — values match promptAssets.ts:102. */
export type MemoryPromptMode = "standard" | "memfs";

let _standard: string | null = null;
let _memfs: string | null = null;

function load(name: string): string {
    return readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf-8");
}

function standardPrompt(): string {
    if (_standard === null) _standard = load("letta_no_memfs");
    return _standard;
}
function memfsPrompt(): string {
    if (_memfs === null) _memfs = load("letta");
    return _memfs;
}

/**
 * Build the system prompt for the "letta" / "default" preset.
 *
 *   buildLettaSystemPrompt("standard") → letta_no_memfs.md  (DEFAULT)
 *   buildLettaSystemPrompt("memfs")    → letta.md (memfs variant)
 *
 * Optionally append a custom persona override at the end so users keep
 * their old agent's voice while gaining tool awareness.
 */
export function buildLettaSystemPrompt(
    memoryMode: MemoryPromptMode = "standard",
    appendPersona?: string
): string {
    const base = (memoryMode === "memfs" ? memfsPrompt() : standardPrompt()).trim();
    if (appendPersona && appendPersona.trim()) {
        return `${base}\n\n# Persona override\n\n${appendPersona.trim()}`;
    }
    return base;
}
