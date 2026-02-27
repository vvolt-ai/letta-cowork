---
name: zoho-mail-local
description: Use this skill when interacting with a local Zoho Mail Express API server for account, folder, email fetch, search, and attachment-to-agent upload tasks. Trigger when users need operational mail data from localhost endpoints and command-based execution guidance.
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
- Default behavior: server automatically uses Primary `accountId` and Inbox `folderId`.
- Params: `start`, `limit`, `status` (`new` for unread), `attachedMails` (bool), `threadedMails` (bool), optional `accountId`, optional `folderId`
- Rule: Do not call `/fetchAccount` or `/fetchFolders` only to resolve default IDs.
- Example:
`curl "http://localhost:4321/fetchEmails?status=new&attachedMails=true"`

### Searching Emails

`GET /searchEmails`
- Default behavior: if `accountId` is not provided, server uses Primary account.
- Params: `searchKey` (required), optional `accountId`
- Key search fragments: `entire`, `sender`, `to`, `subject`, `has:attachment`, `fromDate`, `toDate`
- Use `::` for AND and `::or:` for OR
- Examples:
`curl "http://localhost:4321/searchEmails?searchKey=subject:\"Payment Reminder\""`
`curl "http://localhost:4321/searchEmails?searchKey=fromDate:01-Jan-2024::toDate:31-Jan-2024"`
`curl "http://localhost:4321/searchEmails?searchKey=sender:test@ex.com::or:to:test@ex.com"`

### Attachments

`GET /uploadToAgent`
- Primary behavior: use this endpoint to download message attachments and upload supported files to the Letta agent filesystem.
- Supported upload formats: `.pdf`, `.txt`, `.md`, `.json`, `.docx`, `.html`
- Params: `messageId` (required), optional `agentId`, optional `folderId`, optional `accountId`
- Agent resolution: if `agentId` is omitted, server uses active agent first, then `LETTA_AGENT_ID`.
- Example:
`curl "http://localhost:4321/uploadToAgent?messageId=MSG_123"`

`GET /downloadAttachment` (legacy)
- Use only when local file download is explicitly requested; do not use it for agent ingestion flows.

## Error Handling

- If a port error occurs, verify the server is running on `4321`.
- If a search yields no results, check the `searchKey` first; only provide explicit `accountId`/`folderId` when a non-default mailbox is intended.
