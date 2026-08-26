---
name: email-processing
description: Processes an incoming email end-to-end with classification, attachment inspection, targeted PO/Odoo verification, a concise approval summary, and an explicit no-write approval gate. Use for email triage, purchase-order emails, attachment review, or preparing a proposed downstream action.
---

# Email Processing

Process the email through one consolidated critical path. Preserve the approval gate, but do not rediscover identifiers or reload overlapping procedures.

## Non-negotiable boundary

Before explicit user approval, do not send or forward email, route work, create/update Odoo records, or perform any other write. Read-only verification is allowed.

## Fast-path rules

1. **Reuse supplied context.** If the prompt already contains the email body, `messageId`, `accountId`, `folderId`, attachment metadata, or agent ID, treat those values as authoritative input. Do not list channels/accounts/folders or search for the email again.
2. **Reuse supplied attachment content.** If PDF pages, images, extracted text, CSV/JSON/Markdown, or a transcript are already present in model context, inspect them directly. Do not download or extract the same attachment again.
3. **Use one retrieval route.** If content is missing and the local Cowork email service is available, call the exact local endpoint directly. Do not probe the remote channel list first.
4. **Load references only when needed.** Read `references/classification-guide.md` only for ambiguous classification. For a PO, read `references/po-processing.md`. Read `references/approval-template.md` only when formatting the final summary. When content and identifiers are already supplied, do not also load `cowork-emails`, `pdf-reader`, or another overlapping discovery skill.
5. **Plan tool calls before executing.** After attachment extraction, issue independent read-only Odoo checks together where supported. Start exact and bounded; broaden only after a targeted search returns no useful result.

## Step 1 — Reuse, retrieve, and classify

If the full email is already present, classify it immediately. Otherwise retrieve only the missing data.

When all local identifiers are supplied, use a single direct request. On Windows use:

```text
curl.exe --fail --silent --show-error --get "http://localhost:4321/downloadAttachment" --data-urlencode "messageId=<messageId>" --data-urlencode "accountId=<accountId>" --data-urlencode "folderId=<folderId>" --data-urlencode "agentId=<agentId>"
```

On macOS/Linux, use the same command with `curl` instead of `curl.exe`. Do not use a Unix heredoc on Windows, and never run `npm` merely to make this request.

Only discover an account, folder, channel, or message when its required identifier is genuinely absent. Perform at most one bounded discovery attempt before reporting the missing prerequisite.

Assign one classification label:

- Placing a Purchase Order
- Requesting a Quote
- New Business Inquiry / Inbound Lead
- Technical Support (pre/post sales)
- RMA Request
- Order Status Inquiry
- Documentation & Compliance Request
- Invoice & Payment Inquiry
- Complaint / Escalation
- Other

Record classification, confidence, sender, subject, urgency, and requested action. Extract only facts present in the email.

## Step 2 — Inspect attachments before business verification

For each expected attachment:

1. Validate that its type is expected (PDF, CSV, XLSX, DOCX, image, or text).
2. Reuse model-visible content when available.
3. Otherwise use the direct local download result and inspect the returned file path with an existing supported reader. Use Windows-compatible commands (`npm.cmd`/`npx.cmd`) only when a package command is unavoidable.
4. Extract document type, identifiers, parties, dates, payment/shipping terms, line-item configurations, quantities, unit prices, and totals.
5. If unreadable, state `Attachment content unavailable`; never infer it.

Process every attachment, not only the first.

## Step 3 — Run only the required category checks

### Purchase orders

Read `references/po-processing.md` and execute its read-only fast path.

- Use direct mounted `odoo_search`, `odoo_count`, or `odoo_group` tools. Do not use Bash, curl, Python, Task/subagents, or legacy Odoo wrappers for normal Odoo reads.
- Search configured products by exact `default_code` fragments from the PO, not by enumerating the whole product family.
- Keep initial limits at 5–10 records.
- Run requester/company, duplicate PO, exact products, payment terms, overdue invoices, and address checks together where supported.
- Expand one failed query at a time. Never replace a failed exact query with an unbounded family search.

### Other categories

Perform only checks needed for the requested action. Do not load PO/Odoo procedures for unrelated mail.

## Step 4 — Present one approval summary

Include:

1. classification and confidence;
2. sender, subject, request, and urgency;
3. attachment findings;
4. read-only business-system verification;
5. discrepancies or blockers;
6. proposed writes/actions.

Then ask:

> **Do you approve proceeding with the proposed action?**
> - **Yes** — proceed
> - **No / Modify** — describe changes
> - **Reject** — stop

Stop until the user answers.

## Retry and latency discipline

- Do not repeat successful lookups for verification; consolidate the evidence in memory for the current turn.
- Do not retry the same failing route with equivalent parameters.
- A timeout is evidence to change route, not permission to add more discovery.
- Prefer a small exact result over exhaustive enumeration.
- Keep mandatory business safeguards; remove redundant technical discovery.

## References

- `references/classification-guide.md` — use only when classification is ambiguous.
- `references/po-processing.md` — read-only PO/Odoo fast path and payment-term handling.
- `references/approval-template.md` — final approval-summary format.
