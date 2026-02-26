---
name: zoho-mail-local
description: Interacts with Zoho Mail via a local Express server. Use this for fetching accounts, folders, and emails.
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
- **Params:** `accountId`, `folderId`, `start`, `limit`, `status` (`new` for unread), `attachedMails` (bool), `threadedMails` (bool).
- **Example (Unread with Attachments):**
  `curl "http://localhost:4321/fetchEmails?status=new&attachedMails=true"`

### 3. Searching Emails
`GET /searchEmails` (**Requires** `accountId` and `searchKey`)
- **Key Parameters:** `entire`, `sender`, `to`, `subject`, `has:attachment`, `fromDate`, `toDate`.
- **Logic:** Use `::` for AND, `::or:` for OR.

**Search Examples:**
- **Exact Phrase:** `curl "http://localhost:4321/searchEmails?accountId=123&searchKey=subject:\"Payment Reminder\""`
- **Date Range:** `curl "http://localhost:4321/searchEmails?accountId=123&searchKey=fromDate:01-Jan-2024::toDate:31-Jan-2024"`
- **Sender OR Recipient:** `curl "http://localhost:4321/searchEmails?accountId=123&searchKey=sender:test@ex.com::or:to:test@ex.com"`

### 4. Attachments
`GET /downloadAttachment`
- **Params:** `messageId` (Required), `folderId`, `accountId`.
- **Example:** `curl "http://localhost:4321/downloadAttachment?messageId=MSG_123"`

---

## ⚠️ Error Handling
- If a port error occurs, verify the server is running on `4321`.
- If a search yields no results, verify the `accountId` is correct by running `/fetchAccount` first.