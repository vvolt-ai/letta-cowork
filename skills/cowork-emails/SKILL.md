---
name: cowork-emails
description: Use this skill for Vera Cowork local email APIs: accounts, folders, email listing, single-email fetch, search, processed-email lookup, attachments, and upload-to-agent flows.
---

# Vera Cowork Email APIs

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

## Accounts & Folders

### List email accounts
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/accounts" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### List folders
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/folders?accountId=<accountId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

---

## Emails

### List emails
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/messages?folderId=<folderId>&limit=50&start=0" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

Optional params: `status=read|unread`

### Get single email
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/messages/<messageId>?accountId=<accountId>&folderId=<folderId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Search emails
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/search?searchKey=subject:Invoice&limit=20" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

#### Search syntax (Zoho-style)
- `parameter:value` format
- AND: `::`
- OR: `::or:`

Examples:
- `subject:Invoice`
- `sender:john@example.com::has:attachment`
- `content:"payment overdue"`

---

## Attachments

### List attachments for a message
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/messages/<messageId>/attachments" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Download attachment
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/messages/<messageId>/attachments/<attachmentId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

---

## Processed emails

These return the Letta `conversationId` and `agentId` linked to a processed email.

### List processed emails
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/processed?accountId=<accountId>&folderId=<folderId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Get by message id
```bash
curl "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/processed/<messageId>" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

---

## Operations

### Trigger email sync
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/sync" \
  -H "Authorization: Bearer $COWORK_TOKEN"
```

### Mark emails as read
```bash
curl -X POST "https://vera-cowork-server.ngrok.app/channels/<channelId>/email/mark-read" \
  -H "Authorization: Bearer $COWORK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageIds":["<messageId1>","<messageId2>"]}'
```

---

## Notes

- Always pass `channelId` — emails are scoped to a channel.
- Get `channelId` first via `GET /channels` if unknown.
- If 401, user needs to re-login in Vera Cowork app to refresh `COWORK_TOKEN`.
