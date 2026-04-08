---
name: odoo-mcp-ngrok
description: Use this skill to access the live Odoo MCP server hosted at https://prod-veraai-mcp.ngrok.app. It documents the SSE handshake, available Odoo tools, safe read-first workflows, and wrapper usage for repeated Odoo operations.
---

# Odoo MCP (Ngrok SSE)

Use this skill when you need to query or update Odoo through the live MCP server hosted at:

- `https://prod-veraai-mcp.ngrok.app`

This MCP server uses **SSE handshake + session-specific message endpoint** semantics.
It is not a plain JSON-RPC POST endpoint.

## Server Behavior

1. Open the SSE endpoint:
```bash
GET https://prod-veraai-mcp.ngrok.app/mcp
```

2. The server returns an SSE event like:
```text
event: endpoint
data: /mcp/messages/?session_id=...
```

3. JSON-RPC requests are then POSTed to that returned session URL.

Because of that handshake, use the wrapper script in this skill rather than assuming a fixed POST-only MCP endpoint.

## Available Tools

The live server currently exposes:

- `health_check_health_get`
- `odoo_health_check_health_odoo_get`
- `odoo_search`
- `odoo_count`
- `odoo_group`
- `odoo_get_models`
- `odoo_get_fields`
- `odoo_create`
- `odoo_update`
- `odoo_delete`
- `odoo_call_method`
- `tavily_web_search`

## Recommended Workflow

### Read-first flow
1. Use `odoo_get_models` if model choice is unclear.
2. Use `odoo_get_fields` to inspect available fields before complex queries.
3. Use `odoo_search` to fetch records.
4. Use `odoo_count` to support numeric claims.
5. Use `odoo_group` for grouped reporting / aggregates.

### Write flow
Only use these when the user clearly asks for modifications:
- `odoo_create`
- `odoo_update`
- `odoo_delete`
- `odoo_call_method`

Always prefer **search first, then mutate**.

## Common Tool Argument Shapes

### `odoo_search`
```json
{
  "model": "res.partner",
  "domain": [["name", "ilike", "Acme"]],
  "fields": ["id", "name", "email"],
  "limit": 20
}
```

### `odoo_count`
```json
{
  "model": "sale.order",
  "domain": [["state", "in", ["draft", "sent"]]]
}
```

### `odoo_group`
```json
{
  "model": "sale.order",
  "domain": [["state", "in", ["draft", "sent"]]],
  "fields": ["partner_id", "amount_total:sum", "count"],
  "groupby": ["partner_id"],
  "limit": 50,
  "offset": 0,
  "orderby": "amount_total:sum desc"
}
```

### `odoo_get_models`
```json
{
  "model_filter": "sale",
  "limit": 50
}
```

### `odoo_get_fields`
```json
{
  "model": "sale.order",
  "all_fields": true
}
```

### `odoo_create`
```json
{
  "model": "crm.lead",
  "values": {
    "name": "Inbound lead from email",
    "type": "opportunity"
  }
}
```

### `odoo_update`
```json
{
  "model": "sale.order",
  "ids": [1024],
  "values": {
    "note": "Updated from MCP skill"
  }
}
```

### `odoo_delete`
```json
{
  "model": "crm.lead",
  "ids": [123]
}
```

### `odoo_call_method`
```json
{
  "model": "sale.order",
  "method": "action_confirm",
  "args": "[[1024]]",
  "kwargs": "{}"
}
```

## Wrapper Usage

Use the wrapper script in this skill:

```bash
python3 ~/.letta/skills/odoo-mcp-ngrok/scripts/odoo_mcp_sse.py list-tools
python3 ~/.letta/skills/odoo-mcp-ngrok/scripts/odoo_mcp_sse.py call odoo_get_models '{"model_filter":"sale","limit":20}'
python3 ~/.letta/skills/odoo-mcp-ngrok/scripts/odoo_mcp_sse.py call odoo_search '{"model":"res.partner","domain":[["name","ilike","Acme"]],"fields":["id","name"],"limit":5}'
```

## Safety Rules

- Default to read-only tools first.
- Do not create/update/delete unless the user explicitly wants changes.
- Prefer narrow domains over broad queries.
- If unsure about fields, call `odoo_get_fields` first.
- If unsure about model, call `odoo_get_models` first.

## References

- See `references/live-tool-inventory.md` for the live-discovered tool list and schema summary.
