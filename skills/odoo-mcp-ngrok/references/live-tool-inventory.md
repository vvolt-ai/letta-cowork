# Live MCP Inventory: prod-veraai-mcp.ngrok.app

Discovered via live SSE handshake on 2026-04-08.

## Handshake

1. `GET /mcp`
2. Read SSE event:
   - `event: endpoint`
   - `data: /mcp/messages/?session_id=...`
3. POST JSON-RPC requests to that returned session URL.

## Tools

- `health_check_health_get` - generic health check
- `odoo_health_check_health_odoo_get` - Odoo connection health check
- `odoo_search` - search/read records
- `odoo_count` - count records
- `odoo_group` - grouping and aggregation
- `odoo_get_models` - list/filter available models
- `odoo_get_fields` - inspect model fields
- `odoo_create` - create record
- `odoo_update` - update records
- `odoo_delete` - delete records
- `odoo_call_method` - invoke model methods
- `tavily_web_search` - Tavily web search

## Important Notes

- The built-in generic `mcp-http.ts` helper is not sufficient for this server as-is because the server returns `202 Accepted` to POSTs and delivers responses back on the SSE stream.
- This server therefore benefits from a dedicated wrapper that maintains the SSE stream while posting JSON-RPC messages to the session endpoint.
