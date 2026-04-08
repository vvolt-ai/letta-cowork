---
name: cowork-channels
description: Use this skill when working with Vera Cowork channel APIs: channel CRUD, credentials, runtime start/stop/status, message logs, message sending, and conversation context retrieval.
---

# Vera Cowork Channels API

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

## Channel CRUD

### List channels
```bash
curl "https://vera-cowork-server.ngrok.app/channels" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Get channel
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Create channel
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/channels" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"discord","name":"Sales Discord","config":{}}'
```

### Delete channel
```bash
curl -X DELETE "https://vera-cowork-server.ngrok.app/channels/<channelId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

---

## Credentials & Config

### Get credential metadata
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/credentials" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Update credentials
```bash
curl -X PUT "https://vera-cowork-server.ngrok.app/channels/<channelId>/credentials" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"credentials":{"botToken":"..."},"secureConfig":{}}'
```

### Update config
```bash
curl -X PATCH "https://vera-cowork-server.ngrok.app/channels/<channelId>/config" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"defaultAgentId":"agent-123"}'
```

---

## Runtime

### Start channel
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/channels/<channelId>/start" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Stop channel
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/channels/<channelId>/stop" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Channel status
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/status" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### All runtime status
```bash
curl "https://vera-cowork-server.ngrok.app/channels/runtime/status" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

---

## Messages

### Message logs
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/messages?limit=50&offset=0" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Send message
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/channels/<channelId>/send" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"target-id","content":"Hello from Cowork API"}'
```

### Conversation context
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/conversation?limit=20" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Group conversation context
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/groups/<groupId>/conversation?limit=20" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

---

## Email sub-routes (via channel)

### Email accounts
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/accounts" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Email folders
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/folders?accountId=<accountId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### List emails
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/messages?folderId=<folderId>&limit=50" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Get single email
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/messages/<messageId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Search emails
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/search?searchKey=subject:Invoice" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```
