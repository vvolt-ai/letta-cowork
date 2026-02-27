---
name: odoo
description: Use this skill when an MCP server exposes Odoo tools (`odoo_search`, `odoo_count`, `odoo_create`, `odoo_update`) and optional web lookup (`tavily_web_search`), and the task needs reliable Odoo record analysis or updates. Trigger on CRM, sales, customer, product, order, and related business workflows where responses must be grounded in live Odoo data with correct tool argument formats.
---

# Odoo Expert

## Overview

Use this skill to convert sales emails into precise Odoo tool calls and grounded responses.
Default to read-first (`odoo_search`, `odoo_count`), then use write tools only when user intent clearly requests changes.

## Workflow

1. Read the email and extract:
- customer/account names
- lead/opportunity/order identifiers
- product names/SKUs
- date or status constraints
- explicit user question

2. Choose the Odoo model first (required by both tools).
- Use the model guide in `references/odoo-model-guide.md` when unsure.
- Use the MCP contract guide in `references/odoo-mcp-contract.md` for request shapes.

3. Run read tools first.
- Run `odoo_search` to fetch records.
- Run `odoo_count` to support numeric claims.

4. Run write tools only when requested.
- Run `odoo_create` to create records.
- Run `odoo_update` to modify existing records.

5. Use `tavily_web_search` only when Odoo data is insufficient and external context is explicitly useful.

6. Draft the final response using tool results.
- Include key records and counts.
- State unknowns explicitly if fields are missing.

## Tool Usage Rules

- Always pass `model` for Odoo tools.
- Use Odoo-first for company data; do not replace Odoo facts with web search.
- Prefer narrow domains before broad queries.
- For `odoo_search`, pass a body object: `model`, optional `domain`, optional `fields`, optional `limit`.
- For `odoo_count`, pass `model` and optional `domain`.
- For writes (`odoo_create`, `odoo_update`), confirm intent from email/user instruction before applying.
- If no records are found, report that clearly and suggest the next best lookup.

## MCP Argument Shapes

Use these exact shapes:

- `odoo_search`
  - `model: str` (required)
  - `domain: List[List[Union[str,int,float]]]` (optional)
  - `fields: List[str]` (optional)
  - `limit: int` (optional, default 100)

- `odoo_count`
  - `model: str` (required)
  - `domain: List[Any]` (optional)

- `odoo_create`
  - `model: str` (required)
  - `values: Dict[str,Any]` (required)

- `odoo_update`
  - `model: str` (required)
  - `ids: List[int]` (required)
  - `values: Dict[str,Any]` (required)

- `tavily_web_search`
  - `query: str` (required)

## Fast Patterns

### Pattern: Check open opportunities for a customer email
1. Identify customer from email.
2. Run `odoo_search` on `crm.lead` with customer/domain constraints.
3. Run `odoo_count` on `crm.lead` using the same or narrower domain.
4. Reply with opportunity list + total count.

### Pattern: Validate sales order status request
1. Identify order number or customer from email.
2. Run `odoo_search` on `sale.order` with status-related fields.
3. If email asks volume ("how many pending"), run `odoo_count` on `sale.order`.
4. Reply with status and any blockers.

### Pattern: Customer/account lookup
1. Run `odoo_search` on `res.partner`.
2. Use retrieved partner context to refine lead/order searches.

### Pattern: Email asks to update CRM/order
1. Search record first (`odoo_search`) and identify target IDs.
2. If intent is explicit, run `odoo_update` with those IDs and minimal required fields.
3. Confirm changed fields and IDs in the response.

## References

- For model selection and sales-email mappings, read `references/odoo-model-guide.md`.
- For exact tool argument contracts and examples, read `references/odoo-mcp-contract.md`.
