/**
 * Builds the letta-code-style system prompt that establishes the agent
 * as a coding agent with access to tools, subagents, and memory.
 *
 * Without this prompt, the agent literally doesn't know `Bash`/`Read`/
 * `Edit`/etc. exist, even when we pass them via the `client_tools`
 * parameter at runtime — the model has no instruction in its persona
 * saying "you can call these tools". Letta-code creates new agents
 * with this prompt baked into the `system` field
 * (see cowork-gui/src/agent/create.ts:339).
 *
 * Mirrors cowork-gui's promptAssets.ts → buildSystemPrompt().
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, "prompts");

export type MemoryPromptMode = "memfs" | "blocks";

function loadPrompt(name: string): string {
    return readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf-8");
}

let _letta: string | null = null;
let _blocks: string | null = null;
let _memfs: string | null = null;

function letta(): string {
    if (_letta === null) _letta = loadPrompt("letta");
    return _letta;
}
function blocksAddon(): string {
    if (_blocks === null) _blocks = loadPrompt("system_prompt_blocks");
    return _blocks;
}
function memfsAddon(): string {
    if (_memfs === null) _memfs = loadPrompt("system_prompt_memfs");
    return _memfs;
}

/**
 * Build the full system prompt for a letta-code-style agent.
 *
 *   buildLettaSystemPrompt("blocks")   → letta.md + memory-blocks addon
 *   buildLettaSystemPrompt("memfs")    → letta.md + memfs addon
 *
 * Optionally append a custom persona override (e.g. "You are Bhavesh PA,
 * an executive assistant...") at the end, so users can keep their old
 * agent's voice while still getting tool awareness.
 */
export function buildLettaSystemPrompt(
    memoryMode: MemoryPromptMode = "blocks",
    appendPersona?: string
): string {
    const base = letta().trimEnd();
    const addon = (memoryMode === "memfs" ? memfsAddon() : blocksAddon()).trimStart();
    let out = `${base}\n\n${addon}`.trim();
    if (appendPersona && appendPersona.trim()) {
        out += `\n\n# Persona override\n\n${appendPersona.trim()}`;
    }
    return out;
}
