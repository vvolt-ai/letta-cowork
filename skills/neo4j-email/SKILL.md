---
name: neo4j-email
description: Use this skill when an agent must retrieve or reason about email data stored in Neo4j. Trigger for requests about accounts, emails, senders, recipients, or threads in the email graph domain. Enforce the provided schema as authoritative, respect relationship direction, filter by unique keys, and avoid hallucinating labels, relationships, or properties.
---

# Neo4j Email Expert

## Overview

Use this skill to produce safe, schema-correct Cypher queries for the email graph.
Always ground queries in the declared node types, unique keys, and relationship directions.

## Workflow

1. Identify the user’s target entity:
- account, email message, sender, recipient, or thread.

2. Select the unique key filter whenever available:
- `Account.accountId`
- `Email.messageId`
- `Person.email`
- `Thread.threadId`

3. Build query paths with correct direction:
- `(Person)-[:SENT]->(Email)`
- `(Email)-[:TO]->(Person)`
- `(Account)-[:HAS_EMAIL]->(Email)`
- `(Email)-[:IN_THREAD]->(Thread)`

4. Add context joins only when needed:
- sender, recipients, thread, account context.

5. Return only requested entities and fields.

## Hard Rules

- Treat schema in `references/neo4j-email-schema.md` as authoritative.
- Do not invent labels, relationships, or extra properties.
- Respect relationship direction exactly.
- Prefer unique-key filters over non-unique free-text filters.
- When fetching full context for an email, include:
  - account via `(:Account)-[:HAS_EMAIL]->(:Email)`
  - sender via `(:Person)-[:SENT]->(:Email)`
  - recipients via `(:Email)-[:TO]->(:Person)`
  - thread via `(:Email)-[:IN_THREAD]->(:Thread)`

## Canonical Query Patterns

### Emails for account
```cypher
MATCH (a:Account {accountId: $accountId})-[:HAS_EMAIL]->(e:Email)
RETURN e
```

### Emails in thread
```cypher
MATCH (t:Thread {threadId: $threadId})<-[:IN_THREAD]-(e:Email)
RETURN e
```

### Sender of email
```cypher
MATCH (p:Person)-[:SENT]->(e:Email {messageId: $messageId})
RETURN p
```

### Recipients of email
```cypher
MATCH (e:Email {messageId: $messageId})-[:TO]->(p:Person)
RETURN p
```

### Full email context
```cypher
MATCH (e:Email {messageId: $messageId})
OPTIONAL MATCH (a:Account)-[:HAS_EMAIL]->(e)
OPTIONAL MATCH (p:Person)-[:SENT]->(e)
OPTIONAL MATCH (e)-[:TO]->(r:Person)
OPTIONAL MATCH (e)-[:IN_THREAD]->(t:Thread)
RETURN e, a, p, collect(r) as recipients, t
```

## References

- Read `references/neo4j-email-schema.md` for authoritative schema and query guardrails.
