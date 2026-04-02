/**
 * Letta-Code as Tools
 * -------------------
 * Registers Python function tools on the Letta server that give agents the ability
 * to interact with the Letta platform itself — list agents, send messages to other
 * agents, read/write memory, and more.
 *
 * This is the foundation for agent-to-agent orchestration.
 */

import { Letta } from "@letta-ai/letta-client";

function createLettaClient(): Letta {
    const baseURL = (process.env.LETTA_BASE_URL || "https://api.letta.com").trim();
    const apiKey = (process.env.LETTA_API_KEY || "").trim();
    return new Letta({ baseURL, apiKey: apiKey || null });
}

// ── Python source code for each tool ─────────────────────────────────────────

const TOOL_LETTA_LIST_AGENTS = `
def letta_list_agents(query: str = "") -> str:
    """List all agents on the Letta server. Optionally filter by a name/description query.
    Returns a JSON array with id, name, and description for each agent.

    Args:
        query: Optional text to filter agents by name or description. Leave empty to list all.
    """
    import os, json, urllib.request, urllib.parse
    base_url = os.environ.get("LETTA_BASE_URL", "https://api.letta.com").rstrip("/")
    api_key = os.environ.get("LETTA_API_KEY", "")
    params = {"limit": "50"}
    if query:
        params["query_text"] = query
    url = f"{base_url}/v1/agents/?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    items = data if isinstance(data, list) else data.get("items", data.get("body", []))
    agents = [{"id": a.get("id"), "name": a.get("name"), "description": a.get("description")} for a in items]
    return json.dumps(agents, indent=2)
`;

const TOOL_LETTA_GET_AGENT = `
def letta_get_agent(agent_id: str) -> str:
    """Get detailed information about a specific Letta agent, including its model, system prompt, and memory blocks.

    Args:
        agent_id: The agent ID (e.g. agent-29199764-7bf5-4cfe-a5af-5b48c3e4b7ab)
    """
    import os, json, urllib.request
    base_url = os.environ.get("LETTA_BASE_URL", "https://api.letta.com").rstrip("/")
    api_key = os.environ.get("LETTA_API_KEY", "")
    url = f"{base_url}/v1/agents/{agent_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        agent = json.loads(resp.read())
    # Return concise summary
    result = {
        "id": agent.get("id"),
        "name": agent.get("name"),
        "description": agent.get("description"),
        "model": agent.get("model"),
        "system_preview": (agent.get("system") or "")[:500],
        "tools": [t.get("name") for t in agent.get("tools", [])],
        "memory_blocks": [{"label": b.get("label"), "preview": (b.get("value") or "")[:200]} for b in agent.get("memory", {}).get("blocks", [])]
    }
    return json.dumps(result, indent=2)
`;

const TOOL_LETTA_SEND_MESSAGE = `
def letta_send_message(agent_id: str, message: str) -> str:
    """Send a message to another Letta agent and return its response.
    Use this to delegate tasks to specialist agents (e.g. PO-Expert, Email Classification).
    The agent will process the message and return its full response.

    Args:
        agent_id: The target agent's ID (e.g. agent-29199764-7bf5-4cfe-a5af-5b48c3e4b7ab)
        message: The message/task to send to the agent
    """
    import os, json, urllib.request
    base_url = os.environ.get("LETTA_BASE_URL", "https://api.letta.com").rstrip("/")
    api_key = os.environ.get("LETTA_API_KEY", "")
    url = f"{base_url}/v1/agents/{agent_id}/messages"
    payload = json.dumps({"messages": [{"role": "user", "content": message}]}).encode()
    req = urllib.request.Request(url, data=payload, method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    messages = data.get("messages", [])
    # Extract the final assistant response
    for msg in reversed(messages):
        msg_type = msg.get("message_type", "")
        if msg_type == "assistant_message":
            return msg.get("content", "")
    # Fallback: return all messages as JSON
    return json.dumps([{"type": m.get("message_type"), "content": m.get("content", m.get("reasoning", ""))} for m in messages], indent=2)
`;

const TOOL_LETTA_SEARCH_ARCHIVAL = `
def letta_search_archival(agent_id: str, query: str, limit: int = 10) -> str:
    """Search an agent's archival (long-term) memory for relevant records.
    Useful for finding past decisions, pricing agreements, or historical context stored by an agent.

    Args:
        agent_id: The agent whose archival memory to search
        query: The search query (semantic search)
        limit: Maximum number of results to return (default 10)
    """
    import os, json, urllib.request, urllib.parse
    base_url = os.environ.get("LETTA_BASE_URL", "https://api.letta.com").rstrip("/")
    api_key = os.environ.get("LETTA_API_KEY", "")
    params = {"query": query, "limit": str(limit)}
    url = f"{base_url}/v1/agents/{agent_id}/archival-memory?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    items = data if isinstance(data, list) else data.get("items", [])
    results = [{"id": i.get("id"), "text": i.get("text", "")[:400]} for i in items]
    return json.dumps(results, indent=2)
`;

const TOOL_LETTA_UPDATE_CORE_MEMORY = `
def letta_update_core_memory(agent_id: str, label: str, new_value: str) -> str:
    """Update a core memory block on a Letta agent. Use this to teach an agent new facts,
    update its persona, or store important information in its persistent memory.

    Args:
        agent_id: The agent whose memory to update
        label: The memory block label (e.g. 'human', 'persona', 'lessons_learned')
        new_value: The new content for this memory block
    """
    import os, json, urllib.request
    base_url = os.environ.get("LETTA_BASE_URL", "https://api.letta.com").rstrip("/")
    api_key = os.environ.get("LETTA_API_KEY", "")
    # First get the block ID
    url = f"{base_url}/v1/agents/{agent_id}/core-memory/blocks"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        blocks = json.loads(resp.read())
    block_id = None
    for b in (blocks if isinstance(blocks, list) else []):
        if b.get("label") == label:
            block_id = b.get("id")
            break
    if not block_id:
        return json.dumps({"error": f"Block with label '{label}' not found", "available": [b.get("label") for b in (blocks if isinstance(blocks, list) else [])]})
    # Update the block
    patch_url = f"{base_url}/v1/agents/{agent_id}/core-memory/blocks/{block_id}"
    payload = json.dumps({"value": new_value}).encode()
    patch_req = urllib.request.Request(patch_url, data=payload, method="PATCH",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(patch_req, timeout=15) as resp:
        result = json.loads(resp.read())
    return json.dumps({"success": True, "label": label, "updated_value_preview": new_value[:200]})
`;

const TOOL_LETTA_LIST_TOOLS = `
def letta_list_tools(query: str = "") -> str:
    """List all tools available on the Letta server. Optionally filter by name.
    Returns each tool's name, description, and ID.

    Args:
        query: Optional text to filter tools by name. Leave empty to list all.
    """
    import os, json, urllib.request, urllib.parse
    base_url = os.environ.get("LETTA_BASE_URL", "https://api.letta.com").rstrip("/")
    api_key = os.environ.get("LETTA_API_KEY", "")
    params = {"limit": "100"}
    if query:
        params["query_text"] = query
    url = f"{base_url}/v1/tools/?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())
    items = data if isinstance(data, list) else data.get("items", data.get("body", []))
    tools = [{"id": t.get("id"), "name": t.get("name"), "description": (t.get("description") or "")[:150]} for t in items]
    return json.dumps(tools, indent=2)
`;

// ── Tool registry ─────────────────────────────────────────────────────────────

export interface LettaCodeToolDef {
    name: string;
    description: string;
    sourceCode: string;
}

export const LETTA_CODE_TOOLS: LettaCodeToolDef[] = [
    { name: "letta_list_agents",       description: "List agents on the Letta server with optional search",                    sourceCode: TOOL_LETTA_LIST_AGENTS },
    { name: "letta_get_agent",          description: "Get detailed info (model, system, memory) for a specific agent",          sourceCode: TOOL_LETTA_GET_AGENT },
    { name: "letta_send_message",       description: "Send a message to another agent and receive its response",                sourceCode: TOOL_LETTA_SEND_MESSAGE },
    { name: "letta_search_archival",    description: "Search an agent's archival memory by semantic query",                     sourceCode: TOOL_LETTA_SEARCH_ARCHIVAL },
    { name: "letta_update_core_memory", description: "Update a named core memory block on an agent",                           sourceCode: TOOL_LETTA_UPDATE_CORE_MEMORY },
    { name: "letta_list_tools",         description: "List all tools available on the Letta server with optional name filter",  sourceCode: TOOL_LETTA_LIST_TOOLS },
];

// ── Registration helpers ──────────────────────────────────────────────────────

export interface ToolRegistrationResult {
    name: string;
    status: "created" | "updated" | "skipped" | "error";
    id?: string;
    error?: string;
}

/**
 * Register (or upsert) all letta-code tools on the Letta server.
 * Returns a result for each tool.
 */
export async function registerLettaCodeTools(overwrite = true): Promise<ToolRegistrationResult[]> {
    const client = createLettaClient();
    const results: ToolRegistrationResult[] = [];

    // Fetch existing tools to detect duplicates
    let existingTools: Array<{ id: string; name: string }> = [];
    try {
        const existing = await (client.tools as any).list({ limit: 200 });
        existingTools = (existing?.items ?? existing ?? []).map((t: any) => ({ id: t.id, name: t.name }));
    } catch (e) {
        console.warn("[lettaCodeTools] Could not list existing tools:", e);
    }

    const envVars = [
        { key: "LETTA_API_KEY",  value: process.env.LETTA_API_KEY  ?? "" },
        { key: "LETTA_BASE_URL", value: process.env.LETTA_BASE_URL ?? "https://api.letta.com" },
    ];

    for (const tool of LETTA_CODE_TOOLS) {
        const existing = existingTools.find((t) => t.name === tool.name);

        try {
            if (existing && overwrite) {
                // Delete old version then recreate (Letta SDK doesn't support update)
                await (client.tools as any).delete(existing.id);
            } else if (existing && !overwrite) {
                results.push({ name: tool.name, status: "skipped", id: existing.id });
                continue;
            }

            const created = await (client.tools as any).create({
                name: tool.name,
                description: tool.description,
                source_code: tool.sourceCode.trim(),
                source_type: "python",
                tool_execution_environment_variables: envVars,
            });

            results.push({ name: tool.name, status: existing ? "updated" : "created", id: created?.id ?? created?.tool?.id });
        } catch (err: any) {
            results.push({ name: tool.name, status: "error", error: err?.message ?? String(err) });
        }
    }

    return results;
}

/**
 * Attach all registered letta-code tools to a specific agent.
 */
export async function attachLettaCodeToolsToAgent(agentId: string): Promise<{ attached: string[]; failed: string[] }> {
    const client = createLettaClient();
    const attached: string[] = [];
    const failed: string[] = [];

    // Get current tool IDs from server
    let toolMap: Record<string, string> = {};
    try {
        const allTools = await (client.tools as any).list({ limit: 200 });
        const items: any[] = allTools?.items ?? allTools ?? [];
        for (const t of items) {
            if (LETTA_CODE_TOOLS.some((lt) => lt.name === t.name)) {
                toolMap[t.name] = t.id;
            }
        }
    } catch (e) {
        throw new Error(`Could not fetch tools list: ${e}`);
    }

    for (const tool of LETTA_CODE_TOOLS) {
        const toolId = toolMap[tool.name];
        if (!toolId) {
            failed.push(`${tool.name} (not registered — run Register first)`);
            continue;
        }
        try {
            await (client.agents as any).tools.add(agentId, { tool_id: toolId });
            attached.push(tool.name);
        } catch (err: any) {
            failed.push(`${tool.name}: ${err?.message ?? String(err)}`);
        }
    }

    return { attached, failed };
}

/**
 * List which letta-code tools are already registered on the server.
 */
export async function listRegisteredLettaCodeTools(): Promise<Array<{ name: string; id: string; registered: boolean }>> {
    const client = createLettaClient();
    const toolNames = new Set(LETTA_CODE_TOOLS.map((t) => t.name));

    try {
        const allTools = await (client.tools as any).list({ limit: 200 });
        const items: any[] = allTools?.items ?? allTools ?? [];
        return LETTA_CODE_TOOLS.map((t) => {
            const found = items.find((i: any) => i.name === t.name);
            return { name: t.name, id: found?.id ?? "", registered: !!found };
        });
    } catch (err: any) {
        return LETTA_CODE_TOOLS.map((t) => ({ name: t.name, id: "", registered: false }));
    }
}
