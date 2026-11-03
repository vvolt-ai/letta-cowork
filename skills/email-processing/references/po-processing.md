# Purchase order verification

Use after inspecting the actual PO and relevant thread. All checks here are reads. Do not create contacts, orders, invoices, tags or mailbox drafts until the applicable action is explicitly authorized. Never send email.

## Authorized transport

Use only the authorized configured Odoo connector through VeraMcpListTools and VeraMcpCallTool, following the core skill boundary. Explicitly select the intended connector/environment and use the discovered tool names, schema, domain capabilities and pagination. Do not copy historical connector restrictions or use a legacy route when discovery or execution fails. Do not inspect models/fields unnecessarily when known fields suffice; inspect only when the actual schema is uncertain.

## Extract and plan

Record sender/company, exact PO reference/revision, quote reference, complete product configurations, quantities, currency, prices, discounts, tax/freight, total, payment terms and billing/shipping addresses. Mark absent or unreadable facts rather than guessing.

Use exact bounded searches, initial limits of 5 to 10 and only necessary fields. Plan independent checks together where supported. Retain successful IDs and fields in the turn-local ledger. Aim for no more than 10 reads for a PO tied to a quotation; identify the material gap before expanding. If a limit could hide a duplicate or overdue exposure, use supported exact filtering/count/pagination or report coverage incomplete, not clear.

## Checks

1. **Requester and company:** Search the exact email and verify the customer/legal entity against the PO and existing relationship. An email domain or display name is not proof of authority. Personal addresses require identity review, not automatic rejection unless an applicable authorized policy requires it. If contact creation is needed, propose it without executing it.
2. **Duplicate order:** Search exact PO reference, then confirm customer, company and revision. Distinguish a draft quotation from an accepted order, a PO amendment and a duplicate submission. Do not create another order because a reference was missing on a candidate record.
3. **Applicable quotation:** Prefer exact quote/PO reference plus customer. If using an exact total as a fallback clue, constrain by customer and currency and confirm reference/date, state and full lines. Equal total alone never identifies a quotation. Match configuration, quantity, unit price, discounts, tax/freight and total before reusing product IDs.
4. **Product:** If the matched quotation supplies verified configuration/product IDs, reuse them. Otherwise search product.product by exact default_code fragments from the PO, with at most one targeted fallback and limit at most 10. Do not enumerate a family or invent an order code from a model name. Stop the affected action if variants remain ambiguous.
5. **Price and quantity:** Compare against the applicable agreed quotation, currency, pricelist or verified terms. Catalog list_price alone does not establish the agreed sale price or justify rejecting a PO. Identify changed tax, freight, discounts or quantity breaks separately.
6. **Payment terms:** Compare PO, applicable quotation/agreement and customer record. Expose conflicts rather than assuming one source controls. If terms are missing, state absent. Immediate-payment terms do not prove payment received, credit approval or a payment link.
7. **Credit exposure:** For the verified customer/entity, inspect posted unpaid customer invoices, due dates, currency and residuals. A positive residual with a due date before today is evidence of overdue balance; missing due date is unknown, not automatically overdue. Paginate or report incomplete coverage. Do not claim a credit hold or block without the applicable authorized policy/decision.
8. **Addresses:** Compare the actual invoice/ship-to entities and locations, not just company name. Treat changed addresses or banking details as requiring appropriate identity/security review; do not overwrite existing records from email alone.

## Discrepancy outcomes

| Finding | Proposed next step |
| :--- | :--- |
| Verified match and no material unresolved issue | Present the exact proposed order action for scoped approval; matching is not acceptance |
| Payment or commercial terms differ | Explain the difference and prepare a clarification draft when requested/authorized; do not accept changed terms |
| Required fact absent or attachment unreadable | Identify the affected action and ask only for the missing fact/document |
| New contact/company | Propose identified record creation separately from order creation and terms decisions |
| Suspected duplicate or ambiguous quotation/product | Hold the affected write and resolve identity/scope first |
| Unpaid balance or suspicious change | Show evidence, attention reason and verified owner; obtain the authorized decision |

## Summary and execution

Use the core response patterns. Summarize decision-relevant checks: identity/duplicate, configuration, price/quantity/currency, payment terms, overdue exposure and addresses. Include only material results, discrepancy evidence and incomplete checks. Name each proposed draft, tag, contact/order change or routing action separately. Do not request unspecified blanket approval.

After authorized mutation, read back affected records once. If a timeout makes the outcome ambiguous, check current state before retrying. Report record identity, verified changed fields and remaining blockers without claiming order acceptance, payment receipt, shipment or email delivery from an earlier processing state.
