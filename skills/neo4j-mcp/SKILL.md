---
name: neo4j-mcp
description: Use Vera's governed Neo4j MCP tools to discover accessible graph instances, inspect schema, run bounded read-only Cypher, explain queries, or perform explicitly authorized writes. Trigger for Neo4j, graph data, Cypher, nodes, relationships, graph schema, or graph queries.
---

# Vera Neo4j MCP

Use the mounted Vera Neo4j MCP tools directly. Do not use Bash, `curl`, a Neo4j password, or a direct database driver when the MCP tools are available.

## Available tools

| Tool | Use |
| --- | --- |
| `neo4j_list_instances` | List enabled instances visible to the authenticated Vera user. |
| `neo4j_get_schema` | Inspect labels, relationship types, properties, indexes, and constraints. |
| `neo4j_read` | Run bounded read-only Cypher. |
| `neo4j_explain` | Return an execution plan without running the query. |
| `neo4j_write` | Run an explicitly authorized mutation when effective access permits it. |

If the MCP client prefixes tool names, use the discovered tool whose name ends with the exact name above.

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
- **Authentication/tool unavailable:** ask the user to attach or refresh the Vera Neo4j MCP server. Never request the token in chat.

## Connection reference

The native endpoint is stateless Streamable HTTP at `POST /neo4j-mcp`. It accepts a Vera user token or personal Vera MCP token and preserves the token owner's user, organization, and access grants. Credentials and connection URIs are never exposed through the MCP tools.
