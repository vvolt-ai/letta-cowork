# Odoo MCP Contract (From Existing Server)

Use these contracts exactly when calling tools.

## Endpoints / Operation IDs

- `POST /odoo/search` -> `odoo_search`
- `POST /odoo/count` -> `odoo_count`
- `POST /odoo/create` -> `odoo_create`
- `POST /odoo/update` -> `odoo_update`
- `POST /web/search` -> `tavily_web_search`

## Payload Shapes

### `odoo_search`

```json
{
  "model": "crm.lead",
  "domain": [["type", "=", "opportunity"], ["probability", ">", 0]],
  "fields": ["id", "name", "partner_id", "stage_id", "probability", "expected_revenue"],
  "limit": 50
}
```

Notes:
- `model` is required.
- `domain` defaults to `[]`.
- `fields` defaults to `[]` (server may return default fields when empty).
- `limit` defaults to `100`.

### `odoo_count`

Typical call arguments:

```json
{
  "model": "sale.order",
  "domain": [["state", "in", ["draft", "sent"]]]
}
```

Notes:
- `model` is required.
- `domain` is optional.

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
    "note": "Updated based on customer email"
  }
}
```

### `tavily_web_search`

```json
{
  "query": "competitor pricing for product X"
}
```

Use only when Odoo does not contain the needed information.

## Domain Construction Tips

- Domain format is a list of conditions: `[[field, operator, value], ...]`
- Common operators: `"="`, `"!="`, `"in"`, `"not in"`, `">"`, `"<"`, `">="`, `"<="`, `"ilike"`
- Start narrow:
- customer-specific filters first
- identifier filters (`name`, `id`, `partner_id`) next
- status/date filters last

## Safety For Writes

- Do not run `odoo_create`/`odoo_update` unless the email/user request clearly asks for a change.
- Prefer search-then-update:
1. `odoo_search` to confirm target records.
2. `odoo_update` with explicit IDs.
