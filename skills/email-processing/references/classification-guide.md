# Email Classification Guide

## Category Taxonomy

Assign exactly ONE category from this list. Do not create new categories.

| # | Category | When to Use |
|---|----------|-------------|
| 1 | `Placing a Purchase Order` | Customer is sending a PO document, ordering specific products with quantities and pricing, or confirming a purchase. Attachment often includes a PO PDF or Order Form. |
| 2 | `Requesting a Quote` | Customer is asking for pricing, availability, or lead time on specific products or quantities. No commitment to buy yet. |
| 3 | `New Business Inquiry / Inbound Lead` | Prospect or new contact asking general questions about Verivolt's products, capabilities, or services with intent to explore a business relationship. |
| 5 | `Technical Support (pre and post sales)` | Customer reporting a product issue, asking how to use a product, requesting specifications, reporting parts discrepancy, asking about compatibility. Covers both pre-sale technical questions and post-sale product support. |
| 6 | `RMA Request` | Customer requesting to return a product, asking for a replacement, or initiating a warranty claim. |
| 7 | `Order Status Inquiry` | Customer asking about the status of an existing order, shipment tracking, delivery ETA, or confirmation of receipt. |
| 8 | `Documentation & Compliance Request` | Customer requesting certificates, datasheets, test reports, compliance documents (CE, RoHS, UL), calibration certs, or other technical documentation. |
| 9 | `Invoice & Payment Inquiry` | Customer or vendor asking about an invoice, payment terms, overdue balance, billing discrepancy, or sending a payment receipt. |
| 10 | `Complaint / Escalation` | Customer expressing formal dissatisfaction, escalating an unresolved issue, or threatening consequences. Tone is typically urgent or hostile. |
| 11 | `Other` | Email does not fit any of the above categories. Use when truly ambiguous or when content is internal, spam, marketing, HR, or administrative. |

---

## Classification Rules

1. **Use subject + body** for classification. Start with subject, confirm with body.
2. **Use full body** (from Step 2) to confirm or refine if initially unsure.
3. **Priority order** when an email could span multiple categories:
   - `Placing a Purchase Order` > `RMA Request` > `Technical Support (pre and post sales)` > `Requesting a Quote` > `New Business Inquiry / Inbound Lead`
4. If attachment name contains "PO", "Purchase Order", "Order Form" → lean toward `Placing a Purchase Order`
5. If subject contains "return", "replace", "warranty", "defective" → prefer `RMA Request` over `Technical Support`
6. If subject or body contains "complaint", "dissatisfied", "unacceptable", "escalate" → use `Complaint / Escalation`
7. If email is about an existing shipment or delivery ETA → use `Order Status Inquiry`
8. If email is about certificates, datasheets, or compliance docs → use `Documentation & Compliance Request`
9. When truly ambiguous or none clearly apply → use `Other` and note why in reasoning

---

## Confidence Levels

| Level | Criteria |
|-------|----------|
| **High** | Subject and/or body clearly indicate the category with no ambiguity |
| **Medium** | Category is likely but one or more signals are ambiguous |
| **Low** | Multiple categories could apply; best guess only — use `Other` if very unsure |

---

## Examples

### Placing a Purchase Order
- Subject: "PO #5087227 - ISOBAND V Order"
- Body: "Please find attached our Purchase Order #5087227 for 2 pcs of ISOBAND V (10V 10V)."
- Attachment: "PO_5087227.pdf"

### Requesting a Quote
- Subject: "RFQ - ISOBAND V 10V 10V - 50 units"
- Body: "Please provide pricing and lead time for 50 units of ISOBAND V. We need delivery within 6 weeks."

### New Business Inquiry / Inbound Lead
- Subject: "Inquiry about high-precision sensors for industrial project"
- Body: "Hi, we are a manufacturing company exploring options for precision measurement sensors. Could you tell us more about your product range?"

### Technical Support (pre and post sales)
- Subject: "Re: Wrong parts received - Exc #407722 PO #5087227"
- Body: "We ordered ISOBAND V (10V 10V) but received ISOBAND_ABB V (10V 10V). Did we receive the correct parts?"
- Also applies to: "What is the maximum operating temperature of ISOBAND V?"

### RMA Request
- Subject: "Return request - defective ISOBAND unit"
- Body: "One of the units we received is not functioning correctly. We'd like to initiate a return and replacement."

### Order Status Inquiry
- Subject: "When will our order SO16412 ship?"
- Body: "We placed an order last week and haven't received a tracking number yet. Can you give us an update?"

### Documentation & Compliance Request
- Subject: "CE Certificate for ISOBAND V"
- Body: "Could you please send us the CE certificate and RoHS declaration for ISOBAND V (10V 10V)?"

### Invoice & Payment Inquiry
- Subject: "Invoice #INV-2026-0412 — question on payment terms"
- Body: "We received your invoice but the payment terms don't match what was agreed. Can you clarify?"

### Complaint / Escalation
- Subject: "Unacceptable delays on PO #5088000"
- Body: "This is the third time our order has been delayed with no communication. This is completely unacceptable and we will need to escalate if not resolved immediately."

### Other
- Subject: "Team meeting agenda - April 10"
- Body: "Hi team, please see agenda for tomorrow's all-hands..."
- Also: spam, newsletter, automated system emails

---