# Capability routing and truthful receipts

Source review 2026-10-14 compared the package, active mod MOD.md and read-only live native catalog (50 tools). Snapshot counts/names are evidence, not an immutable catalog or grants. Discover current schemas for the exact principal/server; no write was performed during that review.

## Runtime/transport routing

| Context | Path |
|---|---|
| Letta Code with active Vera mod | `vera_mcp_list_tools` with applicable area/schemas, then `vera_mcp_call_tool` with exact returned name. Active MOD.md is authoritative. |
| Mounted native runtime | Direct exposed native tool/schema. A broker may namespace it (for example a native transport prefix); verify origin/context, not spelling alone. |
| Configured external connector | Its scoped connector catalog and exact namespaced tools; native/configured credentials and identities are not interchangeable. |
| Native tools genuinely not mounted | Bundled helper only for its allowlisted subset and matching session server; never a denial bypass or arbitrary connector/URL proxy. |
| Web user signed out / missing account | Approved interface login/invitation route, not a CLI reinstall or unsolicited access grant. |

The fallback includes selected read tools and requested agent delegation only. It does not automatically support all 50 native tools, mod-local file helpers, Neo4j, configured ERP, guest support or privileged Master operations. Use a supported mounted path or report missing capability. Do not expand the allowlist just because a tool exists.

## Workflow map (verify available names/schemas)

- **Email:** list/read actual authorized mailbox content; retain known channel/account/folder/message context; attachmentRef-only downloads, then file/artifact inspection. For drafts, mounted `vera_generate_email_draft` prepares proposed text but may run an agent; inspect exact source/recipients/content. `vera_save_email_draft` persists a draft only after explicit authorization and required confirmation. Neither authorizes sending. These draft tools are not in the helper allowlist.
- **Channels:** discover/read exact channel first. Create/update/start/stop/share/revoke/delete/send only when requested, within actor scope and current confirmation gates. A stopped bridge or disconnected reader does not prove owned agent/job termination; record stopped/pending/unverified fence/result accurately. Do not restart to bypass an unverified stop. Non-email sends are non-idempotent; no blind replay after uncertain acceptance. Deletion/reset requires separate authority and preservation precautions.
- **Schedules:** list owned schedules and exact run evidence. Creation/update/toggle/delete is a mounted mutation, not a read-helper feature. Verify future action/target/timezone and approval; disabled organization or stopped scheduler does not automatically prove every active execution terminated.
- **Profiles:** current sharing scope/permission, owner and target must be verified. Sharing can grant capability and is an explicit authorized mutation, not a connection fix. Do not borrow a profile owner's login or imply cross-org access from similar names.
- **Remote:** discover actual authorized environments/machines, online status, capability and allowed workspace before invocation. `confirm:true` and other runner controls are not optional. Use working-across-vera-remotes when available; do not interpret a Letta-native list as Vera readiness. No silent fallback, arbitrary shell/file escape or desktop credential borrowing.
- **Configured MCP:** inspect visible/enabled server and cached tools before call. Refresh can change the tool cache; it is not harmless proof of downstream business authority. Tenant/private/profile visibility and upstream ACLs still apply. Odoo uses this route only; no retired dedicated adapter.
- **Skills:** installed versus trusted catalog versus agent-loaded content are different. Catalog refresh alone does not replace a persistent installed copy. Global install/update affects the server audience and requires the authorized owner; preserve managed/custom installations and never delete the volume blindly. Package/commit alone is not adoption.
- **Contacts/delegation:** resolve current published/contact identity, disambiguate once and obtain actual send/notification authority. Agent publication IDs are opaque returned values. Each delegation can perform open-world work; a submitted request or error lacks completion proof. Preserve receipt/run reference and uncertainty; no repeated business replay.

## Documentation versus knowledge

Use an authorized docs connector's keyword search, then selected Markdown sections, for indexed product/platform documentation. The docmd index is not a vector database or current runtime-health check. Its path/hash/index metadata may not contain a verified commit; never invent one. Draft/partial/source-declared baseline remains separate from actual deployment.

Use `vera_search_knowledge` for authorized indexed channel/email/history/other knowledge. It does not replace live mailbox reads or guarantee all GitHub documentation is included. Schema source enums and hybrid/vector availability are version/config dependent. No result means no authorized indexed match, not absence in the original source. Show concise permitted provenance, not confidential internal details to unauthorized users.

## Failure/action receipts

Parse the real result, not merely process exit/outer trace success. Check inner error, completeness, source coverage, accepted versus applied/saved/read-back states. No fabricated IDs, sent notifications, delivery, ownership, deadlines or callbacks. Keep the current user objective and verified source context during recovery.

The helper validates session-server origin, native path, HTTPS/loopback policy and rejects redirects. It keeps bounded body reads under the deadline. Cross-origin configuration is an error: select a matching authorized connection, never export a token to the requested target or follow a redirect manually. A timeout on a non-idempotent operation is outcome unknown; inspect the same operation's authorized receipt/status before retry. HTTP/auth failures do not justify another principal. Malformed inputs/raw upstream failure content are not echoed into chat.
