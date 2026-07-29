---
name: using-kicad-mcp
description: Sets up, verifies, permits, and safely operates mixelpixx/KiCAD-MCP-Server for AI-assisted KiCad schematic and PCB work. Use when an engineer asks to install or connect the KiCad MCP, whitelist KiCad tools in Vera Cowork, inspect or modify a KiCad project, place or route components, run ERC/DRC, create snapshots, or export manufacturing files.
---

# Using KiCad MCP

Use this skill for `mixelpixx/KiCAD-MCP-Server`, the MIT-licensed Python/TypeScript MCP server for KiCad.

## Important distinction

A skill provides operating instructions; it does **not** install or expose MCP tools by itself. The MCP server must run on the machine that owns the KiCad files and must be attached to the agent's runtime. Only call tools that actually appear in the runtime tool catalog.

For Vera Cowork, prefer a **local desktop connector** because this MCP controls local KiCad and local project files. A remote Vera-hosted connector cannot access the engineer's KiCad UI or local files unless a deliberate, secured bridge exists.

## Choose the workflow

- **Install or repair setup:** Read `references/setup.md`, then run the matching verification script.
- **Configure Vera Cowork access:** Read `references/cowork-access.md`.
- **Operate on a design:** Follow the safe workflow below and consult `references/tool-workflows.md`.
- **Find a tool:** Use the live MCP tool catalog first; use `references/tool-map.md` only as a category guide because upstream tools change.

## Safety and sensitivity gate

Before reading design content, classify it.

- Public/open-source board: proceed.
- Internal or confidential board: use only an approved model/provider and approved connector.
- Patent, invention, trade secret, or proprietary algorithm: **STOP on cloud models**. Continue only with an approved local model.

Never expose project paths, session logs, credentials, proprietary schematics, or manufacturing packages to unapproved services.

AI output is not engineering sign-off. Medical, aerospace, automotive, mains-voltage, battery-safety, and other safety-critical designs require independent qualified review.

## Setup workflow

1. Confirm the target OS, KiCad version, MCP client/runtime, and project directory.
2. Inspect the upstream release and README; do not assume old paths or tool counts.
3. Install prerequisites and clone/build the MCP using `references/setup.md`.
4. Run the platform verification script from this skill.
5. Configure the MCP client using an environment-derived path to `dist/index.js`.
6. Restart or refresh the MCP client.
7. Discover live tools and test `check_kicad_ui`.
8. Test a read-only project query before allowing mutations.

Do not silently modify an existing MCP configuration. Back it up, preview the intended change, and ask before applying it.

## Safe design workflow

1. **Identify the exact project** and confirm the `.kicad_pro`, `.kicad_sch`, or `.kicad_pcb` target.
2. **Open and inspect** with read-only tools (`open_project`, `get_project_info`, board/schematic lists).
3. **Snapshot before mutation** with `snapshot_project`, or make a version-control checkpoint.
4. **Plan changes** in a concise list; clarify uncertain electrical requirements.
5. **Apply small batches**. Re-read affected components, nets, and geometry after each batch.
6. **Validate continuously**:
   - Schematic changes: annotate if needed, then run ERC.
   - PCB changes: refill zones if needed, then run DRC.
   - Connectivity changes: inspect nets/pads and compare against the intended netlist.
7. **Render visual evidence** with schematic/board view tools and inspect it.
8. **Save explicitly**. Never use force overwrite unless the user authorizes it after hearing why the external-edit guard fired.
9. **Export only after validation**. Gerbers, drill files, position files, and BOMs are outputs for review—not automatic manufacturing approval.

## Permission policy

Treat tools in three tiers:

### Tier 1 — allow by default (read/diagnostic)

Allow project metadata, library search, component/net listing, geometry queries, previews, ERC/DRC execution, and violation reports.

### Tier 2 — allow for explicit engineering tasks (mutating)

Allow project creation, schematic/PCB placement, edits, wiring, routing, design-rule changes, save, and snapshot tools when the user has asked to modify the design. Snapshot first and validate afterward.

### Tier 3 — require explicit confirmation at the action boundary

Require confirmation for deletion, discard/reload, force save/overwrite, bulk transformations, autorouting import, library registration/modification, remote part downloads, and manufacturing exports intended for release.

Never whitelist every tool merely for convenience. Start with Tier 1, add the minimum Tier 2 tools needed for the workflow, and separately approve Tier 3 tools.

## Tool invocation

- Trust the live tool schema over copied documentation.
- For Vera-hosted MCP tools, call the exact namespaced name returned by `VeraMcpListTools` through `VeraMcpCallTool`.
- Parse the returned `output` value; check `isError` before using it.
- If a tool is missing, ask an operator to refresh the KiCad server catalog and whitelist that exact tool.
- Do not use shell scripts to edit KiCad files when a mounted KiCad MCP tool exists.
- Do not guess parameters. Inspect the live schema or use the server's discovery tools.

## Failure handling

- `pcbnew` import fails: use KiCad's bundled Python or correct `KICAD_PYTHON`/`PYTHONPATH`.
- MCP starts but no tools appear: rebuild, verify `dist/index.js`, restart the client, and refresh the tool catalog.
- IPC unavailable: start KiCad, enable its IPC API server, then reconnect; use SWIG fallback only when appropriate.
- External-edit guard blocks save: stop and reconcile the on-disk change; do not force.
- MCP returns validation error: correct arguments once; do not loop unchanged calls.
- Server timeout/unreachable: report it and diagnose transport/process state.

## Upstream source

Repository: `https://github.com/mixelpixx/KiCAD-MCP-Server`

The repository points to Konnect as its next-generation KiCad 10 plugin. Do not migrate automatically: licensing and architecture differ, so treat that as a separate engineering decision.
