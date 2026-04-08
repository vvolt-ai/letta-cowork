---
name: cowork-odoo
description: Use this skill for Odoo access through Vera Cowork server APIs. Trigger when you need read-only Odoo operations through Cowork backend endpoints rather than direct MCP usage.
---

# Vera Cowork Odoo API

## Base URL

```
https://vera-cowork-server.ngrok.app
```

## Auth

```bash
-H "Authorization: Bearer $COWORK_TOKEN"
```

If `$COWORK_TOKEN` is empty: `COWORK_TOKEN=$(cat ~/.letta-cowork/.cowork-token)`

---

## Endpoints

### List available models
```bash
curl "https://vera-cowork-server.ngrok.app/odoo/models" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Search records
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/odoo/models/search" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "res.partner",
    "domain": [["active", "=", true]],
    "fields": ["id", "name", "email"],
    "limit": 20,
    "offset": 0,
    "order": "name asc"
  }'
```

### Count records
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/odoo/models/count" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "crm.lead",
    "domain": [["active", "=", true]]
  }'
```

### Read by IDs
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/odoo/models/read" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "res.partner",
    "ids": [1, 2, 3],
    "fields": ["id", "name", "email"]
  }'
```

### Model fields
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/odoo/models/fields" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "res.partner",
    "attributes": ["string", "type", "required"]
  }'
```

### Generic read-only tool call
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/odoo/run-read-tool" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "odoo_search_read",
    "args": {
      "model": "crm.lead",
      "domain": [["type", "=", "opportunity"]],
      "limit": 10
    }
  }'
```

---

## Common models

| Model | Description |
|---|---|
| `res.partner` | Customers / contacts |
| `crm.lead` | CRM leads and opportunities |
| `sale.order` | Sales orders |
| `account.move` | Invoices |
| `product.product` | Products |
| `hr.employee` | Employees |

---

## Guidance

- Use `search` + `count` for analysis workflows.
- Use `fields` to discover available fields before querying.
- Use `read` when you already have record IDs.
- Use `run-read-tool` only when the structured endpoints are insufficient.
- These are read-only routes — no create/update supported here.
- If 401, user needs to re-login in Vera Cowork app to refresh `COWORK_TOKEN`.
