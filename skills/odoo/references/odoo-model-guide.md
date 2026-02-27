# Odoo Model Guide For Sales Emails

Use this map when choosing the required `model` argument for `odoo_search` and `odoo_count`.

## Core Models

- `crm.lead`: leads and opportunities, pipeline stage, probability, expected revenue
- `sale.order`: quotations and sales orders, order state, totals, customer link
- `res.partner`: customers/companies/contacts
- `product.product`: sellable product variants and SKU-level product records
- `product.template`: product templates (shared product definitions)
- `crm.team`: sales teams and team ownership

## Intent To Model Mapping

- "How many open opportunities?" -> `crm.lead` + `odoo_count`
- "What is the quote/order status?" -> `sale.order` (+ `odoo_count` if aggregate requested)
- "Find this customer/account" -> `res.partner`
- "Is this product available in catalog?" -> `product.product` or `product.template`
- "Which team owns this deal?" -> `crm.team` and/or `crm.lead`

## Query Strategy

1. Start with the narrowest model that directly matches the email question.
2. Search first (`odoo_search`) to identify concrete records.
3. Count second (`odoo_count`) when numeric summary is requested.
4. If search returns nothing, try:
- alternate spelling from email subject/body
- partner lookup first (`res.partner`), then lead/order lookup
