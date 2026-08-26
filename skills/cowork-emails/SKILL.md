---
name: cowork-emails
description: Use this skill for Vera Cowork local email APIs: accounts, folders, email listing, single-email fetch, search, processed-email lookup, attachments, and upload-to-agent flows.
---

# Vera Cowork Email APIs

## Fast path before discovery

Use the shortest route supported by the identifiers already present:

1. If email and attachment content are already in model context, use them directly; make no retrieval call.
2. If `messageId`, `accountId`, and `folderId` are supplied and the local Cowork app is available, call the local endpoint directly. Do **not** list remote channels/accounts/folders first. On Windows use:

```text
curl.exe --fail --silent --show-error --get "http://localhost:4321/downloadAttachment" --data-urlencode "messageId=<messageId>" --data-urlencode "accountId=<accountId>" --data-urlencode "folderId=<folderId>" --data-urlencode "agentId=<agentId>"
```

3. Use the remote channel API only when local retrieval is unavailable and a `channelId` is already known.
4. Discover a channel/account/folder only when its required identifier is genuinely missing. Make one bounded discovery attempt; do not retry an equivalent route after timeout.

On Windows use `curl.exe` so PowerShell does not substitute a different `curl` command; on macOS/Linux use `curl`. Avoid Unix heredocs on Windows. If package execution is unavoidable there, use `npm.cmd`/`npx.cmd`.

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
