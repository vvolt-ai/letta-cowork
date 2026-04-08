---
name: cowork-server-api
description: Use this skill when you need to access Vera Cowork server APIs from the user's machine. Trigger for channels, emails, neo4j, Odoo, processed-email lookups, or when you need to call the Cowork backend directly. Auth token is available in COWORK_TOKEN env var.
---

# Vera Cowork Server API Guide

## Overview

Use this skill as the entry point for all Vera Cowork backend API calls.

## Base URL

```
https://vera-cowork-server.ngrok.app
```

## Auth

All API calls require a bearer token. The token is automatically written to the environment after login:

```bash
echo $COWORK_TOKEN
```

Use it in every request:

```bash
-H "Authorization: Bearer $COWORK_TOKEN"
```

If `COWORK_TOKEN` is empty, the user needs to log into the Vera Cowork app first. The token is persisted to `~/.letta-cowork/.cowork-token` and written to `~/.zshenv` automatically.

## Which skill to use

- For channel CRUD / runtime / messages → use `cowork-channels`
- For email accounts / folders / messages / search → use `cowork-emails`
- For Neo4j graph queries → use `neo4j-email`
- For Odoo CRM / records → use `cowork-odoo`

## Quick examples

### List channels
```bash
curl "https://vera-cowork-server.ngrok.app/channels" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Search Odoo records
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/odoo/models/search" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"res.partner","domain":[["active","=",true]],"limit":10}'
```

### Neo4j read query
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/neo4j/runReadQuery" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"MATCH (m:Message) RETURN m LIMIT 5","params":{}}'
```

## Token fallback

If `$COWORK_TOKEN` is not in the current shell, read it directly:

```bash
COWORK_TOKEN=$(cat ~/.letta-cowork/.cowork-token)
```

## Important rules

- Always use `$COWORK_TOKEN` — never hardcode tokens.
- Use read-only API methods for analysis tasks.
- If a request returns 401, tell the user to re-login to Vera Cowork app to refresh the token.
- Use the most specific skill for the task (channels / emails / odoo / neo4j) rather than raw curl from this skill.
