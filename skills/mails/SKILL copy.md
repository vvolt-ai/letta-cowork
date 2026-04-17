---
name: zoho-mail-local
description: Interacts with Zoho Mail via a local Express server. Use this for fetching accounts, folders, emails, and uploading attachments to agents.
allowed-tools: Bash
---

# Zoho Mail Local API Execution

## 🚀 Execution Rules
1. **Tool Use:** You MUST use the `Bash` tool to execute these commands. Do not just display them.
2. **Windows Fix:** If running in a Windows PowerShell environment, you MUST use the following format to avoid data truncation:
   `(Invoke-WebRequest -Uri "http://localhost:4321/endpoint").Content`
3. **Linux/macOS Fix:** Use standard curl:
   `curl "http://localhost:4321/endpoint"
---

## 🛰 Endpoints

### 1. Account & Structure

| Endpoint | Description | Example |
| :--- | :--- | :--- |
| `/fetchAccount` | List all connected accounts | `curl "http://localhost:4321/fetchAccount"` |
| `/fetchFolders` | List Inbox, Sent, Trash, etc. | `curl "http://localhost:4321/fetchFolders"` |
| `/agent-capabilities` | Return metadata for all endpoints | `curl "http://localhost:4321/agent-capabilities"` |

### 2. Fetching Emails
`GET /fetchEmails`
- **Default behavior:** server uses Primary `accountId` and Inbox `folderId` automatically.
- **Params:** `start`, `limit`, `status` (`new` for unread), `attachedMails` (bool), `threadedMails` (bool), optional `accountId`, optional `folderId`.
- **Rule:** Do not call `/fetchAccount` or `/fetchFolders` only to discover default IDs.
- **Example (Unread with Attachments):**
  `curl "http://localhost:4321/fetchEmails?status=new&attachedMails=true"`

### 3. Searching Emails
`GET /searchEmails`
- **Default behavior:** if `accountId` is omitted, server uses Primary account.
- **Params:** `searchKey` (required), optional `accountId`.
- **Key Parameters:** `entire`, `sender`, `to`, `subject`, `has:attachment`, `fromDate`, `toDate`.
- **Logic:** Use `::` for AND, `::or:` for OR.

**Search Examples:**
- **Exact Phrase:** `curl "http://localhost:4321/searchEmails?searchKey=subject:\"Payment Reminder\""`
- **Date Range:** `curl "http://localhost:4321/searchEmails?searchKey=fromDate:01-Jan-2024::toDate:31-Jan-2024"`
- **Sender OR Recipient:** `curl "http://localhost:4321/searchEmails?searchKey=sender:test@ex.com::or:to:test@ex.com"`

### 4. Attachments
`GET /uploadToAgent`
- **Primary behavior:** download message attachments and upload supported files to Letta agent filesystem.
- **Supported formats:** `.pdf`, `.txt`, `.md`, `.json`, `.docx`, `.html`
- **Params:** `messageId` (required), optional `agentId`, optional `folderId`, optional `accountId`.
- **Agent resolution:** if `agentId` is omitted, server uses active agent first, then `LETTA_AGENT_ID`.
- **Example:** `curl "http://localhost:4321/uploadToAgent?messageId=MSG_123"`

`GET /downloadAttachment` (legacy)
- Use only when explicitly asked for local file download; avoid it for agent ingestion.

---

## ⚠️ Error Handling
- If a port error occurs, verify the server is running on `4321`.
- If a search yields no results, verify `searchKey` first; only pass explicit `accountId`/`folderId` when you need a non-default mailbox.

--------------------------------------------------
DRAFT EMAIL
--------------------------------------------------

Endpoint:
POST /draftEmail

Payload:
```
{
  "to": ["person@example.com"],
  "subject": "Hello",
  "bodyText": "Plain text body",
  "attachments": [
    { "name": "quote.pdf", "url": "/Users/me/Documents/quote.pdf", "mimeType": "application/pdf" }
  ]
}
```

- At least one `to` recipient is required.
- Provide either `bodyText`, `bodyHtml`, or both.
- Attachments can be local paths or HTTP(S) URLs. Files up to 20 MB are uploaded to Zoho automatically.

--------------------------------------------------
SEND EMAIL
--------------------------------------------------

Endpoint:
POST /sendEmail

Same payload as `/draftEmail`. Optional `draftId` sends an existing draft.

Example:
```
{ "cmd": "curl -X POST -H 'Content-Type: application/json' -d '{\"to\":[\"pbhavesh45@gmail.com\"],\"cc\":[\"ops@example.com\"],\"subject\":\"Daily summary\",\"bodyHtml\":\"<p>Summary</p>\"}' "http://localhost:4321/sendEmail"" }
```

Response JSON matches the primary skill (success/error booleans).

