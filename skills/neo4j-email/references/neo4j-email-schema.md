# Neo4j Email Graph Schema (Authoritative)

Use this schema exactly.

## Graph Domain

- Email System

## Node Types

1. `Account`
- Unique key: `accountId` (UNIQUE)
- Represents a mail account
- One `Account` has many `Email` nodes

2. `Email`
- Unique key: `messageId` (UNIQUE)
- Represents one email message
- Belongs to exactly one `Account`
- May belong to one `Thread`
- May be sent by one `Person`
- May have multiple `TO` recipients (`Person`)

3. `Person`
- Unique key: `email` (UNIQUE)
- Represents a human email identity
- Can send emails
- Can receive emails

4. `Thread`
- Unique key: `threadId` (UNIQUE)
- Represents a conversation thread
- Contains multiple `Email` nodes

## Relationships (Direction Is Mandatory)

- `(Account)-[:HAS_EMAIL]->(Email)`
- `(Email)-[:IN_THREAD]->(Thread)`
- `(Person)-[:SENT]->(Email)`
- `(Email)-[:TO]->(Person)`

## Query Rules

1. Always filter by unique keys when available:
- `Account.accountId`
- `Email.messageId`
- `Person.email`
- `Thread.threadId`

2. Respect relationship direction:
- `SENT` from `Person` to `Email`
- `TO` from `Email` to `Person`
- `HAS_EMAIL` from `Account` to `Email`
- `IN_THREAD` from `Email` to `Thread`

3. Do not assume additional properties unless explicitly present.

4. For full email context, include:
- sender via `(:Person)-[:SENT]->(:Email)`
- recipients via `(:Email)-[:TO]->(:Person)`
- thread via `(:Email)-[:IN_THREAD]->(:Thread)`
- account via `(:Account)-[:HAS_EMAIL]->(:Email)`

## Canonical Patterns

### Get all emails for account

```cypher
MATCH (a:Account {accountId: $accountId})-[:HAS_EMAIL]->(e:Email)
RETURN e
```

### Get emails in thread

```cypher
MATCH (t:Thread {threadId: $threadId})<-[:IN_THREAD]-(e:Email)
RETURN e
```

### Get sender of an email

```cypher
MATCH (p:Person)-[:SENT]->(e:Email {messageId: $messageId})
RETURN p
```

### Get recipients of an email

```cypher
MATCH (e:Email {messageId: $messageId})-[:TO]->(p:Person)
RETURN p
```

### Get full email context

```cypher
MATCH (e:Email {messageId: $messageId})
OPTIONAL MATCH (a:Account)-[:HAS_EMAIL]->(e)
OPTIONAL MATCH (p:Person)-[:SENT]->(e)
OPTIONAL MATCH (e)-[:TO]->(r:Person)
OPTIONAL MATCH (e)-[:IN_THREAD]->(t:Thread)
RETURN e, a, p, collect(r) as recipients, t
```
