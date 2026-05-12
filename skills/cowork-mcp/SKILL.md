---
name: cowork-mcp
description: Use this skill when you need to invoke a tool that lives on an external MCP (Model Context Protocol) server attached to you through Vera Cowork — e.g. Ryze, Composio, or a custom MCP endpoint. Covers tool-name namespacing, the request/response envelope, error patterns, and how to discover what is actually reachable to you. Load this skill BEFORE calling any tool whose name contains a double underscore (`__`).
---

# Cowork MCP

Vera Cowork can proxy tool calls from you to external MCP servers (Ryze for marketing tools, Composio for app integrations, custom endpoints, etc.). The server holds credentials, enforces a whitelist of which tools each agent may use, and returns results back to you using the same shape as your local tools. This skill explains the contract so you can use MCP tools confidently.

## Tool-name format

Every MCP-backed tool exposed to you has a namespaced name:

```
<server-slug>__<original-tool-name>
```

The separator is a **double underscore**. Examples:

- `ryze_2__list_accessible_customers` — Ryze server (slug `ryze_2`), tool `list_accessible_customers`
- `composio__gmail_send_email` — Composio server, tool `gmail_send_email`

If a tool name on your tool list contains `__`, assume it is an MCP tool unless you have other evidence. The slug before `__` identifies which physical server will handle the call; the part after is the tool's name as the server publishes it.

## How to call an MCP tool

You call it like any other tool. The cowork runtime intercepts MCP-named tools, resolves the server, forwards your `args` payload, and returns the response. You do not need to set headers, manage sessions, or know the underlying transport (SSE, HTTP, stdio — all hidden).

**Always pass `args` as a JSON object.** Even tools that take no parameters expect either `args: {}` or no `args` field at all. Never pass a positional argument or a string.

## Response envelope

Every MCP tool call returns this exact shape:

```json
{
  "output": "<stringified result from the MCP server>",
  "isError": false
}
```

- `output` is a **string**. Most MCP servers JSON-encode their result and put it here, so a real-world `output` often looks like a JSON string you need to parse before reading fields. Do not assume it is already an object.
- `isError: false` means the call reached the MCP server and the server returned a normal result. `isError: true` means the MCP server reported an error condition (auth failure, validation error, upstream API error). The `output` will contain the error message — read it and decide whether to retry, ask the human, or surface the failure.

Example, after calling `ryze_2__list_accessible_customers`:

```json
{
  "output": "{\n  \"success\": true,\n  \"accessible_customers\": [{\"customer_id\": \"7477892280\"}],\n  \"count\": 1\n}",
  "isError": false
}
```

Parse `output` as JSON before doing anything with the data.

## Discovering what is reachable

Only tools that an operator has explicitly whitelisted for your agent will appear on your tool list. There are far more tools on each MCP server than are exposed to you — Ryze alone exposes ~850 tools, but a typical agent has 5-20 attached.

**Trust your tool list.** If a tool is not in your tool list, you cannot call it, even if you know it exists on the server. Asking the runtime to "discover more tools" is not something you can do from here.

**If you need a tool you do not have:**
1. Tell the human exactly which tool you need by full name (`<slug>__<tool>`).
2. Tell them to open **Configuration → MCP Servers** in cowork, click Edit on the relevant server, and add the tool to the whitelist.
3. After they save and click Refresh, the tool will be on your list on the next agent attach cycle.

Do not try to invoke tools that are not on your list — you will get a "tool not found" error and waste a turn.

## Error patterns you will see

| Symptom | What it means | What to do |
|---------|---------------|------------|
| `Tool not found: <name>` | Tool is not attached to your agent, or the slug is wrong. | Verify the name is exactly on your tool list. If not, ask the human to whitelist it. |
| `isError: true` with auth message | The MCP server rejected the credentials cowork holds for it. | Tell the human; they need to re-enter the server's auth token in Configuration → MCP Servers. |
| `isError: true` with validation message | Your `args` payload doesn't match the tool's expected schema. | Re-read the tool's description, fix the args, retry once. |
| Timeout / 5xx | MCP server is unreachable. | Tell the human. Do not retry in a loop. |

## What you should NOT do

- Do not assume which tools an MCP server exposes. Read your actual tool list.
- Do not flatten `output` and pretend it's an object — parse it.
- Do not try to bypass cowork and hit the MCP server's URL directly. You don't have the credentials, and the whitelist enforcement lives in cowork.
- Do not retry an `isError: true` response without changing inputs — you'll get the same failure.

## Where to send the human for management

Server setup, whitelisting, refreshing the tool catalog, and deleting servers all happen in:

**cowork → sidebar → Configuration → MCP Servers**

Editing a server uses the pencil icon, deleting uses the trash icon. "Refresh" on a row re-pulls the tool catalog from the MCP server (useful if the server gained new tools since the last sync).
