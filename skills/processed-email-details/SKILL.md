---
name: processed-email-details
description: Retrieve and summarize details of a processed email including the conversation it created. Use when the user wants to know about an email that was processed by an agent, what conversation it created, and the agent's response.
---

# Processed Email Details

This skill retrieves detailed information about a processed email, including:
1. The email content from Zoho Mail
2. The processing record (conversationId, agentId) from Vera Cowork server
3. The conversation messages from Letta API
4. A summary of the agent's response

## Prerequisites

Before using this skill, ensure:
- Vera Cowork app is running (Express server at `http://localhost:4321`)
- Zoho Mail is connected in the app

## Execution Steps

### Step 1: Find the Email in Zoho Mail

Search for the email using the Zoho Mail Express API:

```bash
# Search by subject
curl "http://localhost:4321/searchEmails?searchKey=subject:Invoice"

# Search by sender
curl "http://localhost:4321/searchEmails?searchKey=sender:john@example.com"

# Search with multiple conditions (AND)
curl "http://localhost:4321/searchEmails?searchKey=subject:Invoice::has:attachment"
```

Extract the `messageId` from the response.

### Step 2: Get Account and Folder IDs

If you don't know the accountId and folderId:

```bash
# Get accounts
curl "http://localhost:4321/fetchAccount"

# Get folders
curl "http://localhost:4321/fetchFolders"
```

Use the first account's `accountId` and the Inbox's `folderId`.

### Step 3: Check if Email Was Processed

Use the processedEmails endpoint to check if the email was processed:

```bash
# Get single processed email by messageId
curl "http://localhost:4321/processedEmails?accountId=<accountId>&folderId=<folderId>&messageId=<messageId>"

# Or get all processed emails and find the one you need
curl "http://localhost:4321/processedEmails?accountId=<accountId>&folderId=<folderId>"
```

**Response if processed:**
```json
{
  "id": "record-uuid",
  "messageId": "1771234567890",
  "conversationId": "conv-abc123...",
  "agentId": "agent-xyz789...",
  "processedAt": "2024-01-15T10:30:00Z"
}
```

**Response if not processed:**
- HTTP 404 or empty response

### Step 4: Get Full Email Content

Get the complete email content for detailed analysis:

```bash
curl "http://localhost:4321/fetchEmailById?messageId=<messageId>"
```

### Step 5: Get Conversation Messages (if processed)

If the email was processed, use the conversationId and agentId from Step 3:

```bash
curl "http://localhost:4321/letta/conversation/<conversationId>/messages?agentId=<agentId>&limit=50&order=asc"
```

**Optional - Get agent details:**
```bash
curl "http://localhost:4321/letta/agent/<agentId>"
```

### Step 6: Summarize and Respond

Parse the data and provide a summary including:
1. **Email Details**: Subject, sender, date, key content
2. **Processing Status**: Whether processed or not
3. **Agent Response Summary**: Key points from the agent's analysis
4. **Action Taken**: Any actions the agent performed

## Response Formats

### For Processed Emails

```
### Email Processed

**Subject:** <email subject>
**From:** <sender>
**Processed:** <date/time>

### Agent Response Summary

<summary of the agent's response and actions>

### Conversation Details

- **Conversation ID:** <id>
- **Agent:** <agent name or id>
- **Messages:** <count> messages exchanged
```

### For Unprocessed Emails

```
### Email Found (Not Yet Processed)

**Subject:** <email subject>
**From:** <sender>
**Message ID:** <messageId>
**Received:** <date>

### Email Content Summary

<summary of the email content>

### Status

This email has not been processed by any agent yet. Would you like me to:
1. Process this email with a specific agent?
2. Search for related information in a different way?
```

## Error Handling

- **Email not found**: Report that no matching email was found in Zoho Mail
- **Email not processed**: Report that the email exists but hasn't been processed by an agent yet
- **No conversation found**: Report that processing record exists but conversation is empty
- **API errors**: Report the specific error and suggest retry or alternative approach

## Example Workflow

User asks: "What happened with the email about PO #5087227?"

1. Search for the email:
```bash
curl "http://localhost:4321/searchEmails?searchKey=subject:5087227"
```

2. Check if processed:
```bash
curl "http://localhost:4321/processedEmails?accountId=2467477000000008002&folderId=2467477000000008014&messageId=1771234567890"
```

3. Get full email content:
```bash
curl "http://localhost:4321/fetchEmailById?messageId=1771234567890"
```

4. Get conversation messages:
```bash
curl "http://localhost:4321/letta/conversation/conv-abc123/messages?agentId=agent-xyz&limit=50"
```

5. Summarize findings for the user.

## Quick Reference

| Endpoint | Purpose |
|----------|---------|
| `/searchEmails?searchKey=...` | Find email by subject/sender |
| `/fetchEmailById?messageId=...` | Get full email content |
| `/processedEmails?accountId=...&folderId=...&messageId=...` | Check if processed |
| `/letta/conversation/{id}/messages?agentId=...` | Get conversation messages |
| `/letta/agent/{id}` | Get agent details |
| `/fetchAccount` | Get account info |
| `/fetchFolders` | Get folder list |
