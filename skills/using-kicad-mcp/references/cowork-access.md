# Vera Cowork access and whitelisting

## Architecture decision

KiCAD-MCP-Server is a **local STDIO MCP server**. It operates on local KiCad project files and can integrate with the local KiCad GUI. Therefore:

- Preferred: run it on the engineer's workstation through Cowork's local MCP connector/runtime.
- Avoid: run it only on Vera's remote server and expect access to workstation files or GUI.
- If Cowork currently accepts only remote HTTP/SSE MCP endpoints, add a reviewed local-connector capability or a secured bridge. Do not expose an unauthenticated MCP endpoint to the internet.

A skill cannot create this transport or grant tool permissions. It teaches the agent how to use tools after the runtime mounts them.

## Registration flow

1. Build and verify KiCAD-MCP-Server locally.
2. Open **Cowork → Configuration → MCP Servers**.
3. Add a server named `kicad` using the supported local STDIO configuration, pointing to the built `dist/index.js`.
4. Set only required environment variables; never put secrets into the skill.
5. Refresh the server's tool catalog.
6. Select a minimal whitelist.
7. Attach the server/tools to the intended engineering agent.
8. Start a new attach/session if required for tool discovery.
9. Confirm namespaced tool names with the runtime's MCP tool-list operation.
10. Test read-only access before enabling mutations.

If Cowork does not offer a local STDIO option, stop after step 2 and report the platform gap. Do not pretend a server URL exists.

## Recommended initial whitelist

Start with read and diagnostics:

- `check_kicad_ui`
- `get_project_info`
- `get_board_info`
- `get_layer_list`
- `get_component_list`
- `get_component_properties`
- `get_nets_list`
- `list_schematic_components`
- `list_schematic_nets`
- `get_schematic_view`
- `get_board_2d_view`
- `get_design_rules`
- `run_erc`
- `run_drc`
- `get_drc_violations`
- library/symbol/footprint search and inspection tools
- live discovery tools such as `search_tools`, when present

Tool names and schemas can change. Select only names present in the refreshed catalog.

## Add per workflow

### Schematic authoring

Add project snapshot/save, component placement/editing, wiring/net-label tools, annotation, and board synchronization.

### PCB layout

Add component placement/movement, board outline, routing, via, zone, netclass, refill, and save tools.

### Manufacturing preparation

Add BOM, Gerber, drill/position, PDF, and 3D export tools only to agents that need them. Export permission is not manufacturing approval.

### Library authoring

Add symbol/footprint creation and library registration only to designated library maintainers. These can affect many projects.

## High-risk tools

Require action-boundary approval for tools that:

- delete design objects;
- discard/reload or force overwrite;
- modify/register shared libraries;
- download remote part assets;
- autoroute or import an autorouter session;
- perform bulk movement/transformation;
- export a package explicitly intended for fabrication release.

## Runtime calling convention

In Vera Cowork, MCP tools are namespaced:

```text
<server-slug>__<original-tool-name>
```

Use the exact name returned by `VeraMcpListTools`, then invoke it with `VeraMcpCallTool` and a JSON object for `args`.

Check the response:

```json
{
  "output": "string returned by the MCP server",
  "isError": false
}
```

Parse `output` if it contains JSON. Never treat an `isError: true` response as success.

## Troubleshooting

- Missing tool: refresh catalog, verify whitelist, then reattach the agent.
- Tool not found: use the exact namespaced name from the live list.
- No local STDIO support: platform integration is required; do not work around it with an insecure public tunnel.
- Server cannot see files: it is running in the wrong environment or lacks filesystem permission.
- Server cannot see KiCad UI: confirm it runs on the workstation and that IPC is enabled.
