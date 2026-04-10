# Purchase Order Processing Guide

This guide applies when the email is classified as **"Placing a Purchase Order"**.

Run all checks below **before** presenting the Step 4 approval summary. Each check may add findings and a proposed action to the summary.

---

## PO Processing Checklist (run in order)

### CHECK 1 — Is the sender in our CRM?

Search Odoo for the sender email as a contact:

```bash
# Via Cowork Odoo API
TOKEN=$(cat ~/.letta-cowork/.cowork-token)
curl -s -X POST "https://vera-cowork-server.ngrok.app/odoo/models/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "res.partner",
    "domain": [["email", "=", "<sender_email>"]],
    "fields": ["id", "name", "email", "company_id", "property_payment_term_id", "is_company"],
    "limit": 1
  }'
```

**Outcome A — Contact found:**
- Record the contact's `id`, `name`, `company_id`, and `property_payment_term_id`
- Proceed to **CHECK 3** (Payment Terms)

**Outcome B — Contact NOT found:**
- Proceed to **CHECK 2**

---

### CHECK 2 — Is this a valid corporate email?

**Rule:** Reject free/personal email domains. Only process emails from corporate domains.

**Blocked domains (personal / free email providers):**
- gmail.com, googlemail.com
- hotmail.com, outlook.com, live.com, msn.com
- yahoo.com, yahoo.co.uk, yahoo.fr (and other Yahoo regional variants)
- icloud.com, me.com, mac.com
- aol.com
- protonmail.com, proton.me
- mail.com, inbox.com, gmx.com, gmx.net
- Any other well-known free consumer email service

**If sender domain IS on the blocked list:**
- Mark as: `"Non-corporate email — cannot process PO"`
- Do NOT search for organization or create contact
- Proposed action: Draft a reply asking the customer to resubmit from their corporate email address
- **STOP** — skip remaining checks, go to Step 4 approval

**If sender domain is NOT on the blocked list → valid corporate email:**
- Extract the domain from the sender email (e.g. `digikey.com` from `kelly.gillund@digikey.com`)
- Proceed to **CHECK 2b**

---

### CHECK 2b — Does the domain match an existing organization in CRM?

Search Odoo for any partner whose email domain matches:

```bash
TOKEN=$(cat ~/.letta-cowork/.cowork-token)
curl -s -X POST "https://vera-cowork-server.ngrok.app/odoo/models/search" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "res.partner",
    "domain": [["email", "ilike", "@<domain>"], ["is_company", "=", true]],
    "fields": ["id", "name", "email", "property_payment_term_id"],
    "limit": 5
  }'
```

**Outcome A — Domain match found (organization exists in CRM):**
- Record the matched company: `id`, `name`, `property_payment_term_id`
- The sender is likely an employee of this existing customer
- **Decision:** Create a new contact linked to this company

  ```bash
  # Present this as the proposed action in Step 4 — DO NOT execute until approved
  # Proposed: Create contact "<sender_name>" with email "<sender_email>"
  #           linked to company "<matched_company_name>" (id: <company_id>)
  ```

- Proceed to **CHECK 3** using the matched company's payment terms

**Outcome B — No domain match in CRM + valid corporate email:**
- The sender's organization is completely new to our system
- **Decision:** Create both a new company and a new contact in Odoo

  ```bash
  # Present as proposed action in Step 4 — DO NOT execute until approved
  # Proposed: Create new company "<inferred_company_name>" from domain "<domain>"
  #           and create contact "<sender_name>" linked to it
  ```

- Note: Payment terms for new contacts → use Odoo default (confirm at approval)
- Proceed to **CHECK 3** with "New Contact — default payment terms apply"

---

### CHECK 3 — Payment Terms Check

**Goal:** Verify that the payment terms on the PO match what Verivolt has on record for this customer.

#### 3a. Extract payment terms from the PO

From the PO document (attachment or email body), extract:
- Payment terms stated by customer (e.g. "Net 30", "Net 60", "2/10 Net 30")
- If no payment terms are stated in the PO → note as "Not specified in PO"

#### 3b. Get Verivolt's agreed terms from CRM

From the contact or company record retrieved in CHECK 1 or 2b:
- Read `property_payment_term_id` → this is Verivolt's established payment terms for this customer

If this is a brand new contact (no CRM record yet):
- Payment terms = "To be established" — no discrepancy check needed yet

#### 3c. Compare

| Scenario | Action |
|----------|--------|
| PO terms match CRM terms | No action needed — note "Payment terms: ✅ Match" |
| PO terms NOT specified | No action needed — note "Payment terms: Not stated in PO" |
| PO terms DIFFER from CRM terms | → **Run Payment Terms Discrepancy Flow** (below) |
| CRM terms = "Immediate Payment" | → **Run Immediate Payment Flow** (below) |

---

## Payment Terms Discrepancy Flow

**When:** PO payment terms stated by customer differ from Verivolt's CRM terms.

**Action:** Draft an email to the customer (do NOT send until approved in Step 4).

### Draft Email Template

```
Subject: Re: [Original PO Subject] — Payment Terms Clarification

Dear <Customer Name>,

Thank you for sending your Purchase Order <PO Number>.

We would like to draw your attention to the payment terms outlined in your PO.

Your PO indicates: <Customer's stated terms>
Our agreed payment terms for your account are: <CRM payment terms>

To proceed with processing your order, we kindly ask that you:
1. Confirm your agreement to our established payment terms: <CRM payment terms>
2. Update and resubmit your PO to reflect the agreed terms

Please reply to this email confirming your agreement or contact us if you would like to discuss the terms further.

We look forward to hearing from you and processing your order promptly.

Best regards,
[Verivolt Sales Team]
```

**Points to include in draft:**
- ✅ State Verivolt's current established payment terms clearly
- ✅ State what the customer's PO says
- ✅ Ask for explicit agreement (reply confirmation)
- ✅ Ask for PO update to reflect correct terms
- ✅ Keep tone professional and non-confrontational

---

## Immediate Payment Flow

**When:** `property_payment_term_id` in CRM = "Immediate Payment" (or equivalent: "Immediate", "Due on Receipt", "100% Upfront").

**Action:** Draft an email to the customer with payment instructions (do NOT send until approved in Step 4).

### Draft Email Template

```
Subject: Re: [Original PO Subject] — Payment Required to Process Order

Dear <Customer Name>,

Thank you for sending your Purchase Order <PO Number>.

Please note that your account is set up with Immediate Payment terms. 
To proceed with your order, full payment is required before we can process and ship.

Please find below our payment details:

---
💳 PAYMENT OPTIONS

Option 1 — Online Payment
[Payment Link: <insert payment link>]

Option 2 — Bank Transfer
Bank Name: <Bank Name>
Account Name: <Account Name>
Account Number: <Account Number>
Sort Code / IBAN: <IBAN>
Reference: <PO Number>

---
📄 PROFORMA INVOICE
Please find attached our Proforma Invoice for your order.
Total Amount Due: <amount from PO>

Once payment is confirmed, we will process and ship your order immediately.

Best regards,
[Verivolt Finance Team]
```

**Points to include in draft:**
- ✅ Communicate that payment terms are "Immediate Payment"
- ✅ Include payment link (if available)
- ✅ Include bank/wire transfer details
- ✅ Reference Proforma Invoice (attach or note it needs to be generated)
- ✅ Confirm order will be processed upon receipt of payment

**Note to agent:** If payment link or bank details are not in your memory, flag them as `[TO BE FILLED]` in the draft and note it in the approval summary so the user can complete them before sending.

---

## Summary of PO Processing Findings (for Step 4)

When building the Step 4 approval summary for a PO email, include this additional section:

```
### PO Processing Checks

| Check | Result |
|-------|--------|
| Sender in CRM | Found / Not Found |
| Email type | Corporate / Non-corporate (blocked) |
| Domain match in CRM | Match found: <company> / No match / N/A |
| CRM Contact action | Existing / Create new contact / Create company + contact / N/A |
| PO Payment Terms | <what PO states> |
| CRM Payment Terms | <what CRM has> |
| Payment Terms Status | ✅ Match / ⚠️ Discrepancy / 🔴 Immediate Payment / Not applicable |

### Draft Email (if applicable)
<include full draft here, or "No draft required">

### Proposed Actions (pending approval)
1. <e.g. Create contact X linked to company Y in Odoo>
2. <e.g. Send payment terms clarification email to customer>
3. <e.g. Attach proforma invoice once generated>
```

---

## Anti-Hallucination Rules (PO-specific)

- NEVER assume a contact exists in Odoo — always query first
- NEVER assume payment terms — always read from CRM record
- NEVER fabricate bank details or payment links — use `[TO BE FILLED]` if unknown
- NEVER send any email to the customer — only draft it and include in approval summary
- NEVER create Odoo records before approval
- If Odoo API is unavailable, state clearly: "CRM check could not be completed — manual verification required"
