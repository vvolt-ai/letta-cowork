---
name: neo4j-mcp
description: Use Vera's governed Neo4j MCP tools to discover accessible graph instances, inspect schema, run bounded read-only Cypher, explain queries, or perform explicitly authorized writes. Trigger for Neo4j, graph data, Cypher, nodes, relationships, graph schema, or graph queries.
---

# Vera Neo4j MCP

This skill is self-contained. Call Vera's Neo4j MCP endpoint through the bundled `scripts/call-mcp.mjs` client; do not look for, add, mount, refresh, or attach MCP server tools.

The client reads the current agent's `VERA_TOKEN` environment secret and never accepts a token as an argument. It uses `VERA_NEO4J_MCP_URL` when set, otherwise `/neo4j-mcp` under `VERA_SERVER_URL` or `COWORK_SERVER_URL`, and finally the published Vera server default. Never print, echo, log, or ask the user to paste the token in chat.

## Calling a tool

Resolve the script relative to this `SKILL.md`. For the documented global installation, the path is:

```bash
node "$HOME/.letta/skills/neo4j-mcp/scripts/call-mcp.mjs" <tool-name> <<'JSON'
{ "argument": "value" }
JSON
```

Pass exactly one allowed tool name as the command argument and one JSON object on standard input. Use `{}` for tools with no arguments. Do not put JSON or secrets in command-line arguments. Treat the script's standard output as the MCP tool result and a nonzero exit as failure.

Example:

```bash
node "$HOME/.letta/skills/neo4j-mcp/scripts/call-mcp.mjs" neo4j_list_instances <<'JSON'
{}
JSON
```

Using Bash solely to run this bundled client is the intended workflow. Do not replace it with `curl`, a direct database driver, raw Neo4j credentials, or internal REST routes.

If this skill was installed somewhere other than `~/.letta/skills/neo4j-mcp`, use the actual directory containing this file as the base path.

## Available tools

| Tool | Use |
| --- | --- |
| `neo4j_list_instances` | List enabled instances visible to the authenticated Vera user. |
| `neo4j_get_schema` | Inspect labels, relationship types, properties, indexes, and constraints. |
| `neo4j_read` | Run bounded read-only Cypher. |
| `neo4j_explain` | Return an execution plan without running the query. |
| `neo4j_write` | Run an explicitly authorized mutation when effective access permits it. |

The bundled client accepts only these exact tool names; do not add an MCP client prefix.

## Standard workflow

1. Call `neo4j_list_instances` unless the user already supplied a verified instance slug in the current conversation.
2. Select the instance by its returned `slug`, not its display name.
3. Check `effectivePermission` and `accessMode` in the instance result.
4. Call `neo4j_get_schema` before writing Cypher that depends on unknown labels, relationships, or property names.
5. Use `neo4j_read` for analysis and retrieval.
6. Use `neo4j_explain` before a non-trivial or potentially expensive query.
7. Use `neo4j_write` only when the user clearly requested the mutation and the exact target and impact are understood.

## Read queries

- Prefer the smallest query that answers the question.
- Always include a sensible `LIMIT` for exploratory queries.
- Pass values through `parameters`; do not interpolate user text into Cypher.
- Return only needed properties instead of whole nodes when practical.
- Start with aggregate or existence queries before fetching large result sets.
- Set `maxRecords` to a bounded value appropriate to the request.

Example arguments:

```json
{
  "instance": "operations-graph",
  "cypher": "MATCH (c:Customer) WHERE c.name CONTAINS $name RETURN c.id AS id, c.name AS name ORDER BY c.name LIMIT 20",
  "parameters": { "name": "Acme" },
  "maxRecords": 20
}
```

## Write safety

`neo4j_write` requires both:

- the user's effective permission to be `read_write`; and
- the instance mode to permit writes.

A `read_write` grant can still be capped to read-only by the instance mode. Tool availability is not approval to mutate data.

Before a write:

1. Confirm the user asked for a write rather than an analysis or draft.
2. Identify the instance and exact nodes/relationships affected.
3. Parameterize all values.
4. Prefer an idempotent `MERGE` when its uniqueness semantics are correct.
5. Add narrow predicates; never run an unbounded `DELETE`, `DETACH DELETE`, or mass update without explicit confirmation.
6. Use `neo4j_explain` first for a complex mutation.
7. Report the actual returned counters/result; never claim a write succeeded without tool evidence.

Do not use `neo4j_write` merely to test connectivity.

## Server-enforced boundaries

Vera blocks or constrains:

- writes through `neo4j_read`;
- writes without effective `read_write` access;
- DBMS and security administration;
- external loading such as `LOAD CSV`;
- known dynamic-execution procedure families;
- `PROFILE` through the explain tool;
- excessive result count, result size, and transaction duration.

These controls do not replace least-privilege database credentials or human authorization.

## Error handling

- **No instances returned:** say that no enabled Neo4j instance is visible to the current Vera identity. Do not guess a slug.
- **Instance missing:** refresh with `neo4j_list_instances`; the instance may be disabled, private, revoked, or in another organization.
- **Write denied:** report that effective access or the instance mode is read-only. Do not retry through another route.
- **Schema mismatch:** refresh schema and correct the query; do not invent labels or properties.
- **Query rejected:** explain the blocked class and propose a safer bounded query.
- **`VERA_TOKEN` unavailable:** tell the user to run `/secret set VERA_TOKEN ...` for the current Letta Code agent and start a new session. Never request the token in chat.
- **401/403:** report that the saved token is invalid, expired, revoked, or lacks access. Do not retry through another route.
- **Client script missing:** the skill package is incomplete; reinstall the whole skill directory, including `scripts/call-mcp.mjs`. Do not attach an MCP server as a workaround.
- **Endpoint unreachable:** report the connection failure. Use the configured Vera server URL when provided; do not expose the token while troubleshooting.

## Connection reference

The bundled client calls the stateless Streamable HTTP endpoint at `POST /neo4j-mcp` using the current agent's `VERA_TOKEN`. The endpoint preserves the token owner's user, organization, and access grants. Neo4j credentials and connection URIs are never exposed through the MCP tools.
