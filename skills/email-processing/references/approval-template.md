# Step 4: Approval Output Template

Use this exact structure when presenting the approval summary to the user.
Do NOT deviate from this format. Do NOT skip any section.

---

## Template

```
---
## 📧 Email Processing Summary

### Classification
| Field | Value |
|-------|-------|
| **Category** | <CATEGORY> |
| **Confidence** | High / Medium / Low |
| **Reasoning** | <one sentence explaining why> |

---

### Email Details
| Field | Value |
|-------|-------|
| **Subject** | <subject> |
| **From** | <sender name> <<sender email>> |
| **To** | <recipient> |
| **Date Received** | <date and time> |
| **Urgency** | High / Normal / Low |
| **Tone** | Formal / Urgent / Friendly / Complaint |

---

### Key Information Extracted
| Field | Value |
|-------|-------|
| **Action Requested** | <what sender is asking> |
| **Key Entities** | <order numbers, PO numbers, product names, amounts, etc.> |
| **Customer / Company** | <if identifiable> |
| **Relevant Dates** | <delivery dates, due dates, etc.> |

---

### Attachment
| Field | Value |
|-------|-------|
| **Has Attachment** | Yes / No |
| **Attachment Name(s)** | <names or "None"> |
| **Attachment Type** | PDF / Excel / Image / Other / None |
| **Key Data from Attachment** | <extracted summary or "No attachment" or "Content unavailable"> |

---

### Proposed Next Action
> <Clear, specific description of what you recommend doing next>
> Example: "Route this email to the PO_Expert agent to create a Sales Order in Odoo for 2 pcs of ISOBAND V."

**Confidence in proposed action:** High / Medium / Low

---

### PO Processing Checks *(include only when category = "Placing a Purchase Order")*

| Check | Result |
|-------|--------|
| **Sender in CRM** | Found: <name, company> / Not Found |
| **Email type** | Corporate ✅ / Non-corporate ❌ (blocked) |
| **Domain match in CRM** | Match: <company name> / No match / N/A |
| **CRM Contact action** | Existing / Create contact / Create company + contact / N/A |
| **PO Payment Terms** | <what PO states, or "Not specified"> |
| **CRM Payment Terms** | <what CRM has, or "New contact — default"> |
| **Payment Terms Status** | ✅ Match / ⚠️ Discrepancy / 🔴 Immediate Payment / ➖ N/A |

### Draft Email *(if applicable — payment terms discrepancy or immediate payment)*

```
<Full draft email here, or "No draft required">
```

---

### ⚠️ Awaiting Your Approval

**Do you approve proceeding with the proposed action(s)?**

- ✅ **Yes** — I will proceed with all proposed actions
- ✏️ **Modify** — Tell me what to change and I will update the proposal
- ❌ **Reject** — No action will be taken

> Please reply with Yes, Modify, or Reject.
---
```

---

## Rules for Filling the Template

1. **Every field is required.** If a field has no data, write "Not present" or "None".
2. **Do NOT add extra fields** not in the template.
3. **Key Entities** — list them as a comma-separated inline string, e.g.: `PO #5087227, ISOBAND V, 2 pcs, $312.00`
4. **Proposed Next Action** — be specific. Include the agent name, system (Odoo), and exact action.
5. **Confidence in proposed action** — set Low if classification was Low or email intent was ambiguous.
6. **Attachment content** — extract only what was returned by the API. Never fabricate.

---

## Example (Filled)

```
---
## 📧 Email Processing Summary

### Classification
| Field | Value |
|-------|-------|
| **Label** | CUSTOMER_SUPPORT |
| **Confidence** | High |
| **Reasoning** | Sender reports receiving wrong product variant for a confirmed PO |

---

### Email Details
| Field | Value |
|-------|-------|
| **Subject** | Fwd: Exc # 407722 PO #5087227 |
| **From** | Kelly Gillund <kelly.gillund@digikey.com> |
| **To** | ai.engineering@verivolt.com |
| **Date Received** | Thu, 26 Feb 2026 15:26:05 -0500 |
| **Urgency** | Normal |
| **Tone** | Formal |

---

### Key Information Extracted
| Field | Value |
|-------|-------|
| **Action Requested** | Confirm whether ISOBAND_ABB V (10V 10V) is the same as ordered ISOBAND V (10V 10V) |
| **Key Entities** | PO #5087227, Exc #407722, ISOBAND V, ISOBAND_ABB V, 2 pcs |
| **Customer / Company** | DigiKey (Kelly Gillund - Supplier Quality Coordinator) |
| **Relevant Dates** | Order date: not specified |

---

### Attachment
| Field | Value |
|-------|-------|
| **Has Attachment** | No |
| **Attachment Name(s)** | None |
| **Attachment Type** | None |
| **Key Data from Attachment** | No attachment |

---

### Proposed Next Action
> Route to the support_agent with full email content and ask them to verify product equivalence between ISOBAND V and ISOBAND_ABB V and draft a reply to Kelly Gillund at DigiKey.

**Confidence in proposed action:** High

---

### ⚠️ Awaiting Your Approval

**Do you approve proceeding with the proposed action?**

- ✅ **Yes** — I will proceed with the proposed action
- ✏️ **Modify** — Tell me what to change and I will update the proposed action
- ❌ **Reject** — No action will be taken

> Please reply with Yes, Modify, or Reject.
---
```
