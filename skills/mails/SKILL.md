---
name: zoho-mail-local
description: Use this skill when interacting with a local Zoho Mail Express API server for account, folder, email fetch, search, and attachment retrieval tasks. Trigger when users need operational mail data from localhost endpoints and command-based execution guidance.
---

# Zoho Mail Local API

## Execution Rules

1. Execute commands directly (do not only describe them).
2. On Windows PowerShell, use:
`(Invoke-WebRequest -Uri "http://localhost:4321/endpoint").Content`
3. On macOS/Linux, use:
`curl "http://localhost:4321/endpoint"`

## Endpoints

### Account and Structure

| Endpoint | Description | Example |
| :--- | :--- | :--- |
| `/fetchAccount` | List connected accounts | `curl "http://localhost:4321/fetchAccount"` |
| `/fetchFolders` | List Inbox, Sent, Trash, etc. | `curl "http://localhost:4321/fetchFolders"` |
| `/agent-capabilities` | Return metadata for all endpoints | `curl "http://localhost:4321/agent-capabilities"` |

### Fetching Emails

`GET /fetchEmails`
- Params: `accountId`, `folderId`, `start`, `limit`, `status` (`new` for unread), `attachedMails` (bool), `threadedMails` (bool)
- Example:
`curl "http://localhost:4321/fetchEmails?status=new&attachedMails=true"`

### Searching Emails

`GET /searchEmails` (**Requires** `accountId` and `searchKey`)
- Key search fragments: `entire`, `sender`, `to`, `subject`, `has:attachment`, `fromDate`, `toDate`
- Use `::` for AND and `::or:` for OR
- Examples:
`curl "http://localhost:4321/searchEmails?accountId=123&searchKey=subject:\"Payment Reminder\""`
`curl "http://localhost:4321/searchEmails?accountId=123&searchKey=fromDate:01-Jan-2024::toDate:31-Jan-2024"`
`curl "http://localhost:4321/searchEmails?accountId=123&searchKey=sender:test@ex.com::or:to:test@ex.com"`

### Attachments

`GET /downloadAttachment`
- Params: `messageId` (required), `folderId`, `accountId`
- Example:
`curl "http://localhost:4321/downloadAttachment?messageId=MSG_123"`

## Error Handling

- If a port error occurs, verify the server is running on `4321`.
- If a search yields no results, verify the `accountId` is correct by running `/fetchAccount` first.
