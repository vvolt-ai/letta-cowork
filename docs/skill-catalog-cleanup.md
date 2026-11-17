# Installed skill catalog cleanup — 2026-11-17

Bhavesh requested a review of every skill in the current list and removal of entries that operate against older implementations. This cleanup covers **31 visible skill names / 43 instruction copies** in the current Cowork project's `skills/` and this user's `~/.letta/skills/`. It is not a fleet-wide uninstall, canonical skill-source deletion, server endpoint/container removal or a live integration test.

## Applied removal from discovery

Eight names (eleven installed directories across both roots) were moved, not destroyed. Both copies were removed for the three project entries so an older user-global copy cannot become visible after project removal.

| Skill | Reason | Current route |
|---|---|---|
| `cowork-emails` | Legacy localhost:4321-first mail retrieval and token-file fallback | Authorized live Vera email tools / `vera-mcp` / `email-processing` |
| `processed-email-details` | Requires local Express proxy, assumes first account/Inbox and follows old local processing/history endpoints | Discover scoped current email/processing/history tools; verify source IDs |
| `mails` (declared name `zoho-mail-local`) | Old local proxy, obsolete Bash `cmd` contract and `sendEmail` instructions | Vera email tools; drafts only |
| `cowork-memory` | Neo4j conversation-memory `/channels/graph/*` procedures removed from current channel memory architecture | ACL-scoped KnowledgeModule through current authorized Vera tools; Git/managed agent memory is separate |
| `cowork-odoo` | Redundant retirement-only alias; not an active ERP integration | `odoo`, `cowork-mcp`, `vera-mcp` configured connector discovery |
| `odoo-direct` | Retired direct-RPC compatibility entry point | Same configured connector path; no direct credential/RPC fallback |
| `odoo-mcp-ngrok` | Retired fixed-endpoint/SSE compatibility entry point | Same configured connector path; no fixed production/staging inference |
| `neo4j-mcp` | Installed procedure forces a standalone token/script client and explicitly says not to discover mounted tools, conflicting with the current Vera-first workflow | Active MOD.md/current discovered governed graph tools; the Neo4j service itself is not retired by this cleanup |

The three Odoo aliases were already safe retirement notices. Removing their old names reduces catalog ambiguity; it does not mean they were still making legacy calls. Current `odoo`/configured-MCP guidance remains available.

**Recovery archive:** `~/.letta/skill-archives/2026-11-17-legacy-cleanup/`, with separate `global/` and `project/` directories and a private `manifest.json`. The manifest records instruction fingerprints, original relative locations, decisions and byte-integrity verification. All eleven directory trees were compared before/after moving without following symlinks; original discovery paths are absent. Restore only with explicit approval after checking why the procedure was retired. No credential values were inspected/exported into the report.

## Reviewed and retained

These entries did not establish a retired integration in this scope. Retention is **not certification of every example, third-party release or live provider readiness**.

| Skill | Decision / scope |
|---|---|
| `cowork-channels` | Retain: channel REST operations still have current server routes; prefer actual authorized Vera tools and current schemas. |
| `cowork-mcp` | Retain: configured connector discovery, exact schemas and no legacy ERP fallback. |
| `email-processing` | Retain: current Vera retrieval, configured MCP, scope/attachment/approval and draft-only workflow. |
| `letta-api` | Retain for explicitly authorized direct Letta API work; not a replacement for Vera-scoped operations. |
| `logistic-shipment` | Retain: maintained hosted Shipment Tracker procedure; no live shipment/business call made. |
| `messaging-clio` | Retain: bounded separate-account route with claimed-identity/authority warnings; not invoked. |
| `using-kicad-mcp` | Retain domain capability with follow-up below; no installation/project work authorized by this audit. |
| `vera-mcp` | Retain: mounted/native-first access and limited matching-session fallback, not a denial bypass. |
| `writing-parkinglot-content` | Retain writing/review procedure; current higher-priority publication authority still applies. |
| `acquiring-skills` | Retain installation safety procedure; company canonical-source/approval rules remain authoritative. |
| `agent-browser` | Retain current CLI-backed instruction loader; no browser operation performed. |
| `analyzing-customer-accounts` | Retain current configured-MCP/versioned report/domain workflow. |
| `cowork-server-api` | Retain current routing/developer troubleshooting guide; no legacy Odoo adapter fallback. |
| `creating-skills` | Retain; loaded for this audit. No new skill or distribution package was created. |
| `local-ocr` | Retain offline Tesseract procedure. |
| `managing-support-faqs` | Retain current domain/model workflow with transport wording follow-up below. |
| `messaging-agents` | Retain separate Letta-native communication backend; no message sent. |
| `odoo` | Retain current configured-MCP-only ERP route and explicit write boundaries. |
| `pdf-reader` | Retain local utility: helper supports both pdf-parse v1 and v2; installing dependencies still needs applicable approval. |
| `scheduling-tasks` | Retain native Letta cron backend: `letta cron --help` confirms the command exists. It is not Vera schedule discovery. |
| `syncing-memory-filesystem` | Retain native Git-backed memory procedure, only where that runtime supports it. Current managed AgentMemory/governance boundaries override manual setup/credential changes. |
| `vera-server-login` | Retain explicit developer terminal bootstrap: OTP request/verify routes remain in current auth controller. Prefer the protected signed-in Vera/mod flow; do not print credentials or collect OTP in chat. Not executed. |
| `working-across-vera-remotes` | Retain current Vera/native backend separation and explicit target/permission/receipt procedure. |

## Follow-up wording, not silent deletion of current capabilities

- KiCad's installed provider-policy paragraph predates the deployed OpenAI authorization, and its local-STDIO registration walkthrough is conditional on a capability Cowork may not provide. Follow current governance and actual transport discovery; do not refuse authorized OpenAI work solely from that old paragraph or pretend a local connector exists. Maintained package alignment remains an owner-reviewed follow-up.
- The FAQ domain skill still mentions preferred bare mounts before configured-MCP fallback. Current deployed ERP routing is **configured MCP only** and overrides that sentence. Do not call bare/retired ERP tools. Retiring the FAQ business capability itself would be broader than removing an obsolete transport.
- The native cron guide's omitted-conversation prose differs from current CLI help: current help says omitted/`new` creates a fresh conversation per fire, while `self`/explicit IDs/default have distinct semantics. Use current native help when that backend is explicitly selected; do not reinterpret it as Vera scheduling or create a task during an audit.
- Legacy manual credential-helper/export examples in native utilities do not override managed runtime restrictions or authorize global credential changes. Presence of those examples alone does not prove the underlying native backend is removed.

No maintained `VerivoltDev/Skills` files, another agent's private files/memory, shared server copies, containers, login caches or live grants were changed. Canonical retirement notices can remain as historical source; a future package sync could restore installed copies, so do not reinstall these obsolete procedures blindly. Publishing project deletions is a separate commit/push operation.

## Validation

- Re-listed actual skills after archiving: **23 visible names**; all eight retired names absent from both active roots.
- Recorded 43 instruction fingerprints and verified byte-identical archive moves for eleven installed trees; archive is outside discovery with private parent permissions.
- Updated retained native-MCP client tests to stop depending on the retired standalone Neo4j wrapper, while preserving Vera session binding, email-read, error and credential-output tests.
- Added a bundled-catalog regression test to prevent retired instructions reappearing in the project package.
- Confirmed canonical Skills checkout has no changes. Pre-existing `dist-react/index.html` and `test-results/` changes were preserved, not deleted or staged.
- This is a scoped static audit plus local mock tests—not a live mailbox/Odoo/graph/shipment/KiCad/agent operation, full security audit or fleet-wide version certification. No retired script was executed. No replacement package installation or packaging was needed.
