# Attention, status and proposed tags

Keep category, attention and processing status separate. These are proposed semantic labels, not proof that matching tags or automation exist in the mailbox.

## Attention

| Level | Use when | Required evidence |
| :--- | :--- | :--- |
| Routine | No unresolved intervention is required | Relevant thread/completion evidence reviewed; no hidden blocker assumed resolved |
| Action required | A reply, decision, discrepancy resolution or missing material fact requires intervention | One sentence naming the issue and the next action |
| Urgent | A verified imminent deadline, consequential financial exception, credible security concern or safety risk requires prompt intervention | Actual date/time or risk, impact and escalation reason; sender emphasis alone is insufficient |

Do not require a deadline before flagging a consequential risk. If timing is unknown, say so. Distinguish customer requested date from an accepted commitment; include timezone when timing matters. Do not invent response SLAs or reminder schedules.

Use only applicable reason labels:

| Proposed reason tag | Trigger |
| :--- | :--- |
| technical-review | Conflicting specifications, unverified wiring, replacement equivalence, fault limits or safety claims |
| commercial-review | Price, contract, payment terms or delivery discrepancy requiring an authorized decision |
| financial-exception | Partial refund, disputed charge, missing credit or unreconciled financial recovery |
| security-review | Suspicious identity, banking changes, credential requests or malicious instructions/content |

Attach reason tags to unresolved issues, not every message in a technical or billing category. Avoid duplicate synonymous tags. Do not use tone as evidence of fraud, urgency or ownership. Preserve secondary issues under the same primary category.

## Processing status

| Status | Meaning |
| :--- | :--- |
| Reviewed | Available evidence inspected; no execution or resolution implied |
| Awaiting approval | Specific proposed controlled action needs authorization |
| Blocked | A named missing prerequisite prevents the next material action |
| Waiting externally | A verified request was actually made and a response is outstanding |
| Completed | The defined request is resolved with evidence and no material open subissue |

Use one current status per tracked issue. For mixed threads show unresolved subissues separately; do not close the whole thread when only one issue is resolved. A draft is not a sent request, so it cannot by itself justify Waiting externally. Missing content that was not reviewed must not be labeled fully Reviewed.

For every attention issue retain: reason, owner or `unassigned`, next action, known deadline or review date, and supporting source. Label a suggested owner as a recommendation until assignment is verified. Being copied is not ownership. For Sheilon, routine sales quotation work remains with its verified sales owner unless a specific instruction or escalation establishes an exception; do not manufacture a CEO task from copied correspondence.

## Applying mailbox tags

1. Default to proposed labels in the internal summary, not mailbox changes. The skill does not authorize tagging.
2. Identify the exact account, message/thread, available tag semantics and supported operation. Do not assume display labels map directly to provider tags, categories or folders.
3. Reuse an existing appropriate tag where available. Creating a new tag, applying/removing it, moving mail or changing read status requires the applicable explicit authorization. Describe each intended mutation.
4. Keep attention/reason tags separate from status labels. Never replace the category taxonomy with attention tags.
5. On an authorized retry, inspect current state first. Do not duplicate tags or remove unrelated/user managed labels. Do not automatically remove a resolved tag without authorization.
6. Read back the target after mutation when supported. State `proposed`, `applied and verified`, `failed`, or `applied but readback not checked` accurately. A text label in the response is not a mailbox tag.
7. Do not invent a tagging endpoint. If the approved tool is missing, provide proposed tags and report the narrow capability gap. Do not claim alerts, automatic escalation or ongoing monitoring are active.

## Resolution rules

Carry forward unresolved commitments before processing new events. Before clearing an attention flag, check the reply/action evidence and remaining subissues. For financial recovery, retain expected, issued, received, currency, variance, dispute path, owner and next date until reconciled. A refund initiation or closed case with unpaid/disputed money is not completion. Surface a material deduction or denial immediately to the authorized owner; outbound notification still requires its own authority and verified route.
