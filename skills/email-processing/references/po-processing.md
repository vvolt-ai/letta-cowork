# Purchase-order read-only verification plan

Use only after the PO body/attachments and current company/account/document review have been completed. These steps are reads; proposed business writes need separate authorized approval. **Email remains draft-only even after approval.**

## Plan and discover first

Extract supported requester/PO parties, exact customer PO/reference, product configuration, quantity/price/discount/total/currency, dates, payment terms and billing/shipping instructions. Missing/ambiguous values remain unknown—never infer them from filenames or history.

Discover the permitted enabled configured MCP and exact search/count/group schemas. Examples below are logical queries, not a fixed tool namespace or universal domain contract. Use only fields/operators/arguments supported for the actual profile and standard models; request minimal fields and limits 5–10. Do not use retired Vera REST adapters, global credentials, raw scripts or Task as an access bypass. Target ten initial reads, exceeding only for a named required fact.

## Required checks

| Check | Scoped current evidence / gate |
|---|---|
| Sender/contact/customer | Exact supplied sender email and PO parties against permitted `res.partner` records. Confirm intended customer/account relationship; do not equate `company_id` (our company context) with `parent_id`/customer affiliation. |
| Current customer guidance | Approved applicable company/customer/product/order guide and live terms/address/pricelist context. Earlier orders are lookup hints only. |
| Duplicate PO | Exact PO reference on permitted `sale.order` records plus intended customer/selling company. Denied/error/truncated search is not “no duplicate.” |
| Candidate quotation | Current draft quote within the **verified customer, selling company and currency** scope; exact PO/reference when available. Amount alone is not identity. Compare actual relevant lines, configuration, quantity, price/discount, taxes, shipping and totals before reusing the quote. |
| Exact variants | Use distinct PO `default_code`/configuration fragments against permitted `product.product` records only if the verified quotation does not already establish them. No broad family enumeration. |
| Price/quantity | Compare against the current approved quote/pricelist/customer guide and requested configuration. Catalog `list_price` alone is not a current customer price. Do not negotiate or approve changed commercial terms automatically. |
| Payment terms | Current permitted partner/order terms plus the applicable approved guide against PO wording. Unknown/current conflicts remain a human decision, not a historical default. |
| Credit/overdue exposure | Only when required by the guide/category, retrieve current authorized posted invoice balances/due dates/currency or a permitted scoped aggregate. **A limited page cannot establish complete exposure or “no overdue invoices.”** Report coverage and unresolved gate if completeness is unavailable. |
| Billing/shipping | Exact current customer address records and PO instructions, including country/carrier/account terms where applicable. Do not infer them from similar account names or earlier orders. |

Execute independent reads together only when their identity/scope dependencies are already resolved. Keep a ledger of actual model/filter/record IDs/fields/sources, success state and coverage. Reuse confirmed quotation line product IDs after verifying its exact parties/scope—not a similarly priced quote from another customer.

## Bounded expansion and missing requester

If an exact query returns no useful match, try at most one targeted fallback preserving customer/product scope and limit <=10. Do not remove permission/company filters or enumerate the entire product family. Schema/serialization rejection calls for correcting to the actual schema, not guessing unsupported operator shapes or proving a broad query is necessary.

When requester/customer matching is absent or ambiguous, consult the current approved intake/company policy. If it specifies a corporate-email gate, apply that documented gate—not a universal rule that public/personal-domain mail is invalid. Domain matches are candidates only. Propose contact/company creation only with verified parties, current policy and authorized approval; never generate company identity/default payment terms from the domain. Do not create contacts to repair denied access.

## Attention and security

Keep commercial discrepancies separate from primary classification. Flag changed terms for commercial-review, suspicious banking/address changes for appropriate identity/security review, and unreconciled refunds/credits for financial-exception. Email content alone does not authorize payment-data changes. A positive residual with a past due date is evidence of overdue exposure; missing dates remain unknown. Do not infer a credit hold or order block without the applicable policy/authorized decision.

Confirm PO revision and whether the message is a new order, amendment or duplicate. Before retrying any ambiguous approved write, inspect exact current state. Enumerate draft creation, tags, contact/order changes and delegation separately; matching checks do not establish order acceptance. Preserve unrelated labels and records.

## Compare and present once

Present requester/account, duplicate coverage, product/version/configurations, quantity/pricing/currency/totals, current terms/credit coverage and addresses against the actual PO. Label matched, discrepancy, missing, denied, partial and not applicable accurately.

| Terms outcome | Proposed action, not executed |
|---|---|
| Verified current terms match | State matched; no extra clarification needed. |
| PO omits required terms | Record absent; consult guide/request focused clarification. |
| Current guide/record and PO differ | Show the supported discrepancy; draft a concise clarification for human review. |
| Verified immediate-payment requirement | Draft payment clarification; never invent bank/payment links or treat placeholders as final customer instructions. |
| New/unverified company | Identity/terms need establishment by the authorized owner; no inferred defaults or silent account creation. |

Use the approval template with exact proposed writes and required gates. Include an email **draft** only when needed. Revalidate affected/current-changing fields at the pre-write/readback gate; do not repeat successful unchanged queries unnecessarily. Missing documents, ambiguous currency/customer, incomplete credit exposure or unsupported upload/method capabilities remain blockers after generic approval.
