---
name: zoho-mail-local
description: Execute Zoho Mail operations against the local Zoho Mail Express API (localhost:4321). All API calls must be executed using the Bash tool.
---

# Zoho Mail Local Operations

This skill interacts with a locally running Zoho Mail Express API server.

Base URL:
http://localhost:4321

--------------------------------------------------
CRITICAL EXECUTION MODEL
--------------------------------------------------

This skill executes Zoho Mail API calls via the Bash tool.

The Bash tool is the ONLY allowed execution mechanism.

You MUST:

1. Construct a valid curl command.
2. Call the Bash tool.
3. Pass the command using the `cmd` field.
4. Wait for stdout JSON.
5. Parse the returned JSON.
6. Continue reasoning using ONLY returned data.

Never:
- Use local_shell (not available)
- Return curl commands as plain text
- Simulate API responses
- Fabricate messageId or accountId
- Retry malformed commands blindly
- Invent attachment content

If Bash returns:
- Empty output → treat as failure
- Error text → report execution failure
- JSON → parse strictly

--------------------------------------------------
BASH TOOL FORMAT
--------------------------------------------------

When calling Bash, use EXACTLY this structure:

{
  "cmd": "curl \"http://localhost:4321/endpoint\""
}

Important:
- The key MUST be `cmd`
- Do NOT use `command`
- Do NOT use `script`
- Do NOT wrap in markdown
- Do NOT explain the command before executing

--------------------------------------------------
OS HANDLING
--------------------------------------------------

Assume Linux/macOS unless explicitly told Windows.

Default format:

curl "http://localhost:4321/endpoint"

Only use PowerShell if explicitly requested:

powershell -Command "(Invoke-WebRequest -Uri 'http://localhost:4321/endpoint').Content"

--------------------------------------------------
DISCOVERY ENDPOINT POLICY
--------------------------------------------------

Discovery endpoints:

- /fetchAccount
- /fetchFolders
- /agent-capabilities

Never call them automatically.

Only call them if user explicitly requests:
- Account listing
- Folder listing
- API inspection

Do not call discovery endpoints before operational endpoints.

--------------------------------------------------
EMAIL FETCHING
--------------------------------------------------

Endpoint:
GET /fetchEmails

Defaults:
- Server auto-resolves primary accountId
- Server auto-resolves Inbox folderId

Never call /fetchAccount to resolve defaults.
Never call /fetchFolders to resolve defaults.

Example Bash call:

{
  "cmd": "curl \"http://localhost:4321/fetchEmails?status=new&limit=20&attachedMails=true\""
}

--------------------------------------------------
EMAIL FETCH BY ID
--------------------------------------------------

Endpoint:
GET /fetchEmailById

Required:
messageId

Optional:
accountId (omit unless explicitly required)
folderId (omit unless explicitly required)

Behavior:
- Returns full email content including body

Example:

{
  "cmd": "curl \"http://localhost:4321/fetchEmailById?messageId=789\""
}

Never fabricate messageId.
Always extract messageId from search results JSON or email list.

--------------------------------------------------
EMAIL SEARCH
--------------------------------------------------

Endpoint:
GET /searchEmails

Required:
searchKey

Optional:
accountId (omit unless explicitly required)

Search format:
parameter:value

Combine conditions:
AND → ::
OR → ::or:

Exact phrases:
Wrap in double quotes.

Example:

curl "http://localhost:4321/searchEmails?searchKey=subject:\\\"Tesla PO\\\"::has:attachment"

Execution example:

{
  "cmd": "curl \"http://localhost:4321/searchEmails?searchKey=subject:\\\"Tesla PO # 5101276770\\\"::has:attachment\""
}

Never fabricate messageId.
Always extract messageId from search results JSON.

--------------------------------------------------
ATTACHMENT INGESTION
--------------------------------------------------

Primary endpoint:
GET /downloadAttachment

Behavior:
- Downloads attachment
- If agentId provided, uploads file to Letta filesystem

Required:
messageId

Optional:
agentId

Example:

{
  "cmd": "curl \"http://localhost:4321/downloadAttachment?messageId=789&agentId=agent-xxx\""
}

Never guess messageId.
Always retrieve messageId from search results first.

--------------------------------------------------
OPERATIONAL ORDER
--------------------------------------------------

When processing email with attachment:

1. Call /searchEmails
2. Extract messageId from JSON
3. If attachment required → call /downloadAttachment
4. Continue processing using returned data
5. Never skip execution steps

--------------------------------------------------
ANTI-HALLUCINATION RULE
--------------------------------------------------

You must ONLY use:

- JSON returned from Bash
- Actual attachment content
- Explicit email data from API

Never:
- Assume accountId
- Assume folderId
- Invent search results
- Fabricate messageId
- Guess attachment contents

If API returns empty result:
State clearly: No results found.

If Bash returns error:
Report execution failure clearly.

Do not retry identical failing commands repeatedly.

--------------------------------------------------

This skill operates in a closed local deterministic environment.
All API interactions MUST be Bash-executed.