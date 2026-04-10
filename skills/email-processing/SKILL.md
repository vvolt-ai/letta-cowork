---
name: email-processing
description: Use this skill when an agent needs to process an incoming email end-to-end. Covers the full 4-step flow: (1) classify the email type and intent, (2) gather structured information from the email content, (3) verify and download attachments if present, (4) present a structured summary to the user and wait for explicit approval before taking any next action.
---

# Email Processing Skill

Use this skill to process any incoming email through a **4-step approval-gated workflow**.

The agent MUST complete all 4 steps in order. The agent MUST NOT take any downstream action (routing, replying, creating records) until the user explicitly approves at Step 4.

---

## Prerequisites

- Vera Cowork app running (local Express server at `http://localhost:4321`)
- Zoho Mail connected in the app

---

## Step 1: Classify the Email

**Goal:** Identify what type of email this is and what action it likely requires.

### 1a. Get the email if you don't have it yet

If you already have the email content (e.g. passed in from a channel), skip to 1b.

Otherwise search by subject or sender:

```bash
# Search by subject keyword
curl "http://localhost:4321/searchEmails?searchKey=subject:<keyword>"

# Search by sender
curl "http://localhost:4321/searchEmails?searchKey=sender:<email>"

# Search with attachment filter
curl "http://localhost:4321/searchEmails?searchKey=subject:<keyword>::has:attachment"
```

Extract `messageId` from the JSON response.

### 1b. Classify

Using the email subject and body (or preview), assign exactly ONE classification label.

See `references/classification-guide.md` for the full label taxonomy and examples.

**Output of Step 1:**
```
Classification: <CATEGORY NAME>
  (one of: Placing a Purchase Order | Requesting a Quote |
   New Business Inquiry / Inbound Lead | Technical Support (pre and post sales) |
   RMA Request | Order Status Inquiry | Documentation & Compliance Request |
   Invoice & Payment Inquiry | Complaint / Escalation | Other)
Confidence: High / Medium / Low
Reasoning: <one sentence>
Sender: <email address>
Subject: <subject line>
Urgency: High / Normal / Low
```

---

## Step 2: Gather Information

**Goal:** Extract all structured data from the full email body.

### 2a. Fetch full email content

```bash
curl "http://localhost:4321/fetchEmailById?messageId=<messageId>"
```

### 2b. Extract structured fields

From the full email body, extract ALL of the following that are present:

| Field | Description |
|-------|-------------|
| Sender name | Full name of sender |
| Sender email | Email address |
| Recipient | Who it was sent to |
| Date received | Timestamp |
| Subject | Email subject |
| Action requested | What the sender is asking for |
| Key entities | Customer names, order numbers, PO numbers, invoice IDs, amounts, product names, dates |
| Tone | Formal / Urgent / Friendly / Complaint |
| Has attachment | Yes / No |
| Attachment names | List if present |

**Rules:**
- Extract ONLY what is present in the email. Do NOT infer or invent.
- If a field is missing, write "Not present".
- If the email is HTML, parse the plain-text content only.

---

## Step 2b: Category-Specific Processing

After completing Step 2, run the category-specific processing for the classified email type **before** moving to Step 3.

### If category = "Placing a Purchase Order"

Run the full PO processing checklist from `references/po-processing.md`. This covers:

1. **CRM sender lookup** — is the sender's email already in Odoo?
2. **Email validity check** — is this a corporate email? (Reject gmail, hotmail, yahoo, etc.)
3. **Domain/org match** — if sender not in CRM, does their domain match an existing company?
4. **Contact creation decision** — create new contact and/or company if needed (propose, don't execute yet)
5. **Payment terms check** — do the PO terms match the CRM terms?
   - If discrepancy → draft a payment terms clarification email
   - If CRM = "Immediate Payment" → draft a payment instructions email with payment link, bank details, and proforma invoice
6. Add all findings and any drafted emails to the Step 4 approval summary

**CRITICAL:** Do NOT create Odoo records or send any emails until Step 4 is approved.

### All other categories

No additional processing required — proceed directly to Step 3.

---

## Step 3: Verify and Download Attachment

**Goal:** If an attachment is present, download it and extract key data from it.

### 3a. Check for attachment

Use the `hasAttachment` flag from the email metadata in Step 2. If `false`, skip to Step 4.

### 3b. Download attachment

**Notes:**
- Make sure not download harmful files. Only proceed if the file type is expected (PDF, CSV, XLSX, DOCX, or image).
- Do NOT guess or fabricate attachment content. Only use what the API returns.

### 3c. Extract from attachment

If the attachment content is returned (PDF text, CSV, markdown), extract:
- Document type (Purchase Order, Invoice, Quote, etc.)
- Key identifiers (PO number, invoice number, order date)
- Line items (product names, quantities, prices)
- Totals
- Parties (buyer name, vendor name)

If attachment content is unavailable or unreadable, write: `"Attachment content unavailable"`.

---

## Step 4: Summarize and Ask for User Approval

**Goal:** Present a full structured summary to the user and wait for explicit approval before proceeding.

Use the template in `references/approval-template.md` to format your output.

### 4a. Present summary

Show the user:
1. **Email Classification** — label, confidence, reasoning
2. **Key Information** — all structured fields from Step 2
3. **Attachment Summary** — extracted content or "No attachment"
4. **Proposed Next Action** — what you recommend doing next

### 4b. HARD STOP — Wait for approval

After presenting the summary, ask exactly:

> **Do you approve proceeding with the proposed action?**
> - **Yes** — proceed with the proposed action
> - **No / Modify** — describe what you'd like changed
> - **Reject** — stop, no action taken

**CRITICAL:** Do NOT take any action until the user explicitly responds with approval.

Do NOT:
- Route to another agent
- Send a reply
- Create an Odoo record
- Forward the email
- Update any system

...until the user says Yes.

---

## API Quick Reference

| Endpoint | Purpose |
|----------|---------|
| `GET localhost:4321/searchEmails?searchKey=...` | Search for email by subject/sender |
| `GET localhost:4321/fetchEmailById?messageId=...` | Get full email content |
| `GET localhost:4321/downloadAttachment?messageId=...` | Download attachment |
| `GET localhost:4321/downloadAttachment?messageId=...&agentId=...` | Download + upload to Letta |
| `GET localhost:4321/fetchAccount` | Get account ID (only if needed) |
| `GET localhost:4321/fetchFolders` | Get folder IDs (only if needed) |

---

## Anti-Hallucination Rules

- NEVER fabricate a `messageId`, `accountId`, or `folderId`
- NEVER invent email content or attachment data
- NEVER assume attachment content if the API did not return it
- ONLY use data returned from actual API calls
- If any API call fails, report the failure clearly and do not continue with fake data
- If the email is not found, say so clearly

---

## References

- `references/classification-guide.md` — full email category taxonomy and examples for Step 1
- `references/po-processing.md` — Purchase Order processing checklist (CRM lookup, contact creation, payment terms, draft emails) for Step 2b
- `references/approval-template.md` — structured output format for Step 4
