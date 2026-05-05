/**
 * Agent migration — clone an existing agent into a brand-new
 * `letta_v1_agent` so it natively supports runtime client_tools
 * (Bash, Skill, file ops, etc.).
 *
 * Strategy:
 *   1. Read the source agent's name, system prompt, model, memory blocks.
 *   2. Create a new agent with agent_type=letta_v1_agent, copying:
 *      • name (suffixed " (v1)" so the user can tell them apart)
 *      • system prompt verbatim
 *      • model
 *      • memory blocks as independent copies (label + value + description)
 *      • tools = web_search, fetch_webpage  (letta-code's defaults; client
 *        tools come in at runtime via client_tools)
 *   3. Return the new agent id.
 *
 * What we deliberately do NOT do:
 *   • copy conversation history — letta_v1 manages conversations differently
 *   • share block ids — independent copies so changes don't bleed across
 *   • copy tool attachments — the new agent uses runtime client_tools
 */

import { Letta } from "@letta-ai/letta-client";
import { buildLettaSystemPrompt } from "./buildSystemPrompt.js";

function getClient(): Letta {
    const apiKey = (process.env.LETTA_API_KEY ?? "").trim();
    const baseURL = (
        process.env.LETTA_BASE_URL || "https://api.letta.com"
    ).trim();
    if (!apiKey) throw new Error("LETTA_API_KEY is not configured");
    return new Letta({ apiKey, baseURL });
}

export interface MigrationOptions {
    /** Required — id of the source agent to clone. */
    sourceAgentId: string;
    /** Optional override for the new agent's name. Defaults to "<source> (v1)". */
    newName?: string;
    /** Server-side tools to attach. Defaults to letta-code's choices. */
    baseTools?: string[];
    /**
     * Strategy for building the new agent's system prompt:
     *   • 'letta-code' (default) — use letta-code's coding-agent prompt
     *     (letta.md) plus the memory-blocks addon. The agent will know
     *     about Bash/Read/Edit/etc. and use them naturally.
     *   • 'letta-code+persona' — letta-code prompt PLUS the source
     *     agent's old prompt appended as a "Persona override". Best of
     *     both worlds when the user wants to keep their agent's voice.
     *   • 'preserve' — copy the source agent's prompt verbatim. The
     *     agent will have the same persona but no tool awareness; only
     *     useful when you've already manually authored a tool-aware
     *     prompt.
     */
    systemPromptMode?: "letta-code" | "letta-code+persona" | "preserve";
}

export interface MigrationResult {
    sourceAgentId: string;
    newAgentId: string;
    newAgentName: string;
    blocksCopied: number;
    skippedBlocks: Array<{ label: string; reason: string }>;
}

interface SourceAgentSnapshot {
    id: string;
    name: string;
    system: string;
    model: string;
    embeddingHandle: string | null;
    blocks: Array<{
        label: string;
        value: string;
        description: string | null;
        limit: number | null;
    }>;
}

/** Fetch the source agent's details into a normalised snapshot. */
async function snapshotSource(
    client: Letta,
    sourceAgentId: string
): Promise<SourceAgentSnapshot> {
    const agent = (await (client.agents as unknown as {
        retrieve: (id: string) => Promise<unknown>;
    }).retrieve(sourceAgentId)) as Record<string, unknown>;

    const memory = (agent.memory ?? {}) as { blocks?: Array<Record<string, unknown>> };
    const blocks = (memory.blocks ?? []).map((b) => ({
        label: String(b.label ?? ""),
        value: String(b.value ?? ""),
        description: (b.description as string | null) ?? null,
        limit: typeof b.limit === "number" ? (b.limit as number) : null,
    })).filter((b) => b.label.length > 0);

    return {
        id: String(agent.id ?? sourceAgentId),
        name: String(agent.name ?? "untitled"),
        system: String(agent.system ?? ""),
        model: String(agent.model ?? ""),
        // Embedding can come back under different keys depending on SDK version.
        embeddingHandle:
            (agent.embedding as string | null) ??
            (agent.embedding_handle as string | null) ??
            null,
        blocks,
    };
}

/** Create the new letta_v1_agent with copied memory blocks. */
async function createTargetAgent(
    client: Letta,
    snapshot: SourceAgentSnapshot,
    opts: MigrationOptions
): Promise<{ id: string; name: string }> {
    const newName = opts.newName?.trim() || `${snapshot.name} (v1)`;
    const baseTools = opts.baseTools ?? ["web_search", "fetch_webpage"];

    const memoryBlocks = snapshot.blocks.map((b) => ({
        label: b.label,
        value: b.value,
        description: b.description ?? undefined,
        ...(b.limit ? { limit: b.limit } : {}),
    }));

    // Build the new agent's system prompt. Default = letta-code's
    // prompt so the agent actually knows it has Bash/Read/Edit/etc.
    const mode = opts.systemPromptMode ?? "letta-code";
    let systemPrompt: string;
    if (mode === "preserve") {
        systemPrompt = snapshot.system;
    } else if (mode === "letta-code+persona") {
        systemPrompt = buildLettaSystemPrompt("blocks", snapshot.system);
    } else {
        systemPrompt = buildLettaSystemPrompt("blocks");
    }

    const createBody: Record<string, unknown> = {
        name: newName,
        agent_type: "letta_v1_agent",
        system: systemPrompt,
        model: snapshot.model,
        tools: baseTools,
        memory_blocks: memoryBlocks,
    };
    if (snapshot.embeddingHandle) {
        createBody.embedding = snapshot.embeddingHandle;
    }

    const created = (await (client.agents as unknown as {
        create: (body: Record<string, unknown>) => Promise<unknown>;
    }).create(createBody)) as Record<string, unknown>;

    const id = String(created.id ?? "");
    if (!id) throw new Error("agents.create returned no id");
    return { id, name: String(created.name ?? newName) };
}

/**
 * Public API — migrate an existing agent into a fresh letta_v1_agent.
 * Idempotent on the source: source is read-only, never modified.
 */
export async function migrateAgentToV1(
    opts: MigrationOptions
): Promise<MigrationResult> {
    if (!opts.sourceAgentId || typeof opts.sourceAgentId !== "string") {
        throw new Error("migrateAgentToV1: sourceAgentId is required");
    }

    const client = getClient();
    const snapshot = await snapshotSource(client, opts.sourceAgentId);
    const target = await createTargetAgent(client, snapshot, opts);

    return {
        sourceAgentId: snapshot.id,
        newAgentId: target.id,
        newAgentName: target.name,
        blocksCopied: snapshot.blocks.length,
        skippedBlocks: [],
    };
}

/**
 * Update an EXISTING agent's system prompt to letta-code's. Use this
 * when an agent is already letta_v1_agent but doesn't know it has
 * tools — much faster than full migration. The old system prompt can
 * be appended as a "Persona override" section so the agent's voice is
 * preserved.
 *
 * Returns {oldLength, newLength} so the UI can show a diff summary.
 */
export async function refreshAgentSystemPrompt(opts: {
    agentId: string;
    /** Default 'letta-code+persona' — keeps the agent's old persona below the letta-code prompt. */
    mode?: "letta-code" | "letta-code+persona";
    memoryMode?: "blocks" | "memfs";
}): Promise<{ oldLength: number; newLength: number; system: string }> {
    if (!opts.agentId || typeof opts.agentId !== "string") {
        throw new Error("refreshAgentSystemPrompt: agentId is required");
    }
    const client = getClient();
    const agent = (await client.agents.retrieve(opts.agentId)) as unknown as {
        system?: string;
    };
    const oldSystem = String(agent.system ?? "");
    const memoryMode = opts.memoryMode ?? "blocks";
    const mode = opts.mode ?? "letta-code+persona";
    const newSystem =
        mode === "letta-code"
            ? buildLettaSystemPrompt(memoryMode)
            : buildLettaSystemPrompt(memoryMode, oldSystem);

    await (
        client.agents as unknown as {
            modify: (id: string, body: Record<string, unknown>) => Promise<unknown>;
        }
    ).modify(opts.agentId, { system: newSystem });

    return {
        oldLength: oldSystem.length,
        newLength: newSystem.length,
        system: newSystem,
    };
}
