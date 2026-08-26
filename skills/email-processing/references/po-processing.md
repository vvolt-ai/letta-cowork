# Purchase Order Read-Only Fast Path

Use this reference only after the PO attachment/body has been inspected and its exact identifiers/configurations are known.

## Guardrail

All steps below are reads. Do not create contacts, companies, sales orders, invoices, or emails until the user approves the final summary.

## Build the query plan first

Extract these values before calling Odoo:

- requester email and company/domain;
- customer PO/reference number;
- exact product configuration fragments;
- quantities, customer unit prices, and total;
- PO payment terms;
- billing and shipping addresses.

Do not query Odoo for a value that has not yet been extracted from the PO.

## First read batch

Issue independent calls together where the runtime supports parallel tool calls. Use direct mounted Odoo tools only.

### 1. Requester/contact

```text
odoo_search
model: res.partner
domain: [["email", "=", "<sender_email>"]]
fields: ["id", "name", "email", "parent_id", "company_id", "is_company", "property_payment_term_id", "street", "street2", "city", "state_id", "zip", "country_id"]
limit: 5
```

### 2. Duplicate customer PO

```text
odoo_search
model: sale.order
domain: [["client_order_ref", "=", "<exact_po_reference>"]]
fields: ["id", "name", "state", "client_order_ref", "partner_id", "amount_total", "date_order"]
limit: 5
```

### 3. Exact product variants

Run one bounded query per distinct PO configuration:

```text
odoo_search
model: product.product
domain: [["default_code", "ilike", "<product family + voltage/range/output fragment>"]]
fields: ["id", "display_name", "default_code", "list_price", "currency_id", "active"]
limit: 5
```

Example search fragments:

```text
ISOBLOCK V-1C (1000V 10V
ISOBLOCK V-1C (1500V 10V
```

Never start with `name ilike "IsoBlock V-1c"` at a high limit. The base name represents a large variant family and is not enough to identify a sellable configuration.

### 4. Overdue exposure

Once the customer/company partner ID is known, use a bounded invoice query:

```text
odoo_search
model: account.move
domain: [["partner_id", "child_of", <partner_id>], ["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["payment_state", "!=", "paid"]]
fields: ["id", "name", "invoice_date_due", "amount_residual", "payment_state", "currency_id"]
limit: 10
order: invoice_date_due asc
```

Treat only records whose due date is before today and residual amount is positive as overdue. If the connector rejects a compound domain, remove one condition at a time and preserve the same small limit; do not replace it with a broad all-invoice query.

## Conditional lookup only when requester is absent

If the exact requester email is not found:

1. Reject known personal/free email domains for PO processing.
2. For a corporate domain, search up to five company candidates:

```text
odoo_search
model: res.partner
domain: [["email", "ilike", "@<corporate_domain>"]]
fields: ["id", "name", "email", "is_company", "property_payment_term_id"]
limit: 5
```

Filter the small result set for company records. Propose contact/company creation in the approval summary; do not execute it.

Common personal domains include Gmail, Outlook/Hotmail/Live, Yahoo, iCloud, AOL, Proton, Mail.com, Inbox.com, and GMX.

## Compare once

Use the first read batch to produce one comparison table:

| Check | Compare |
|---|---|
| Requester | Exact sender email against contact/company |
| Duplicate | Exact PO reference against `client_order_ref` |
| Product | PO configuration against complete `default_code` and display name |
| Price | PO unit price against the identified variant price |
| Quantity | PO quantity against proposed order quantity |
| Payment terms | PO terms against `property_payment_term_id` |
| Credit exposure | Due date and residual amount of unpaid posted invoices |
| Address | PO billing/shipping address against customer/address records |

Do not rerun successful searches merely to verify the same fact.

## Search expansion policy

If an exact product query returns no useful result:

1. remove only the least reliable configuration fragment;
2. keep `default_code` as the searched field;
3. keep `limit <= 10`;
4. inspect the small result set;
5. stop and report ambiguity rather than enumerating the whole family.

If an Odoo domain is rejected, preserve the exact target and simplify its syntax. Boolean/list serialization errors are not evidence that a broad search is required.

## Payment terms outcomes

| Scenario | Approval-summary action |
|---|---|
| PO matches CRM | Mark as matched; no draft needed |
| PO omits terms | State that PO terms are absent |
| PO differs from CRM | Draft a clarification requesting confirmation and a corrected PO |
| CRM requires immediate payment | Draft payment-required email; leave unavailable payment links/bank details as `[TO BE FILLED]` |
| New organization | Propose company/contact creation and state that terms must be established |

## Required approval-summary section

```text
### PO Processing Checks

| Check | Result |
| Requester/customer | ... |
| Duplicate PO | ... |
| Product configurations | ... |
| Price/quantity | ... |
| PO vs CRM payment terms | ... |
| Overdue exposure | ... |
| Billing/shipping address | ... |

### Discrepancies and blockers
- ...

### Proposed actions (not executed)
1. ...
```

Include a customer email draft only when a discrepancy requires one. Keep it concise and do not invent payment instructions.
