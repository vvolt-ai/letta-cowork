# KiCad MCP tool map

Use this only to choose a category. Always inspect the live catalog/schema because upstream releases add and rename tools.

| Goal                  | Typical tools                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Project lifecycle     | `create_project`, `open_project`, `get_project_info`, `snapshot_project`, `save_project`, `close_project`                       |
| Board inspection      | `get_board_info`, `get_layer_list`, `get_board_extents`, `get_board_2d_view`                                                    |
| Board geometry        | `set_board_size`, `add_board_outline`, `add_mounting_hole`, `add_board_text`, graphics query/edit tools                         |
| Components            | `place_component`, `move_component`, `rotate_component`, `get_component_list`, `get_component_properties`, pad/geometry queries |
| Nets and routing      | `add_net`, `route_trace`, `route_pad_to_pad`, `add_via`, `query_traces`, `get_nets_list`, differential-pair and zone tools      |
| Schematic components  | `add_schematic_component`, `edit_schematic_component`, `list_schematic_components`, `annotate_schematic`                        |
| Schematic wiring      | `add_schematic_wire`, `connect_to_net`, `add_schematic_net_label`, pin-location and connectivity queries                        |
| Sync and validation   | `sync_schematic_to_board`, `run_erc`, `run_drc`, `get_drc_violations`, clearance checks                                         |
| Libraries             | symbol/footprint list, search, info, create, edit, register, import/export tools                                                |
| Part sourcing         | JLCPCB search/detail/alternative and parts-registry tools                                                                       |
| Autorouting           | `check_freerouting`, `export_dsn`, `autoroute`, `import_ses`                                                                    |
| Manufacturing outputs | `export_gerber`, `export_bom`, `export_position_file`, PDF/SVG/3D/netlist exports                                               |
| UI                    | `check_kicad_ui`, `launch_kicad_ui`                                                                                             |
| Discovery             | `list_tool_categories`, `get_category_tools`, `search_tools` when present                                                       |

## Read-before-write sequence

For an unfamiliar project, use roughly this order:

1. `check_kicad_ui`
2. `open_project`
3. `get_project_info`
4. schematic component/net lists
5. board component/net/layer lists
6. current ERC/DRC status
7. preview render
8. `snapshot_project`
9. mutations
10. re-query + ERC/DRC + preview
11. `save_project`

## Avoid stale assumptions

The upstream README and tool inventory have historically differed in counts and router details. Never infer availability from a copied list. The live MCP catalog is authoritative.
