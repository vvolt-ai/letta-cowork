# KiCad MCP engineering workflows

## New schematic-to-board design

1. Confirm requirements: supply rails, interfaces, current/voltage ratings, mechanical envelope, layer count, fabrication constraints.
2. Create the project and schematic.
3. Search standard symbols/footprints before creating custom libraries.
4. Place symbols and set values, footprints, manufacturer, and part-number properties.
5. Wire in small functional blocks; query pin locations instead of guessing coordinates.
6. Add net labels and no-connect markers intentionally.
7. Annotate and run ERC. Resolve or explicitly document every violation.
8. Snapshot.
9. Synchronize schematic to board.
10. Set board outline, stack/rules/netclasses, then place components.
11. Check placement clearance and ratsnest/airwire lengths.
12. Route critical nets first, then remaining nets; refill zones.
13. Run DRC and render board views.
14. Save and snapshot.
15. Export review artifacts. Produce fabrication outputs only after human engineering review.

## Modify an existing project

1. Confirm exact project and intended change.
2. Inspect project metadata, git status/checkpoint state, components, nets, and current violations.
3. Snapshot before edits.
4. Apply one logical change at a time.
5. Verify references, values, footprints, pins, net connectivity, and geometry.
6. Run ERC/DRC and compare violation counts to baseline.
7. Render before/after previews.
8. Save without force. If an external-edit guard fires, reconcile first.

## Create a custom symbol or footprint

1. Search installed and approved part registries first.
2. Verify the manufacturer datasheet and package drawing.
3. Record source, revision, units, pin numbering, origin, courtyard, and assembly tolerances.
4. Create in a project-local library before considering shared registration.
5. Inspect every pin/pad mapping and render it.
6. Validate against a known physical drawing; do not rely only on an AI-generated result.
7. Register in a shared library only with explicit maintainer approval.

## Autorouting

1. Validate placement and design rules first.
2. Snapshot.
3. Run dependency check.
4. Export DSN or call autoroute with bounded timeout/passes.
5. Inspect the imported session visually.
6. Refill zones and run DRC.
7. Treat the result as a proposal. Human-review critical nets, return paths, differential pairs, impedance, creepage, thermal paths, and manufacturability.

## Manufacturing package

1. Confirm project revision and clean ERC/DRC status.
2. Confirm stackup, board outline, dimensions, materials, copper weight, finish, impedance requirements, drill rules, and panelization responsibility.
3. Render and inspect copper, mask, silkscreen, drill, and board outline.
4. Export Gerbers/drills, position file, BOM, assembly drawings, and 3D model as required.
5. Verify the package with an independent Gerber viewer.
6. Compare BOM quantities/MPNs against the schematic and sourcing approvals.
7. Ask for explicit human release approval. Never order fabrication automatically.

## Verification checklist

- Electrical: power pins, decoupling, polarity, ratings, pullups, unused pins, connector pinout.
- Connectivity: no floating labels/orphaned wires, correct net classes, expected ratsnest.
- Physical: board outline, holes, connectors, keepouts, clearances, component height.
- Signal integrity: differential geometry, impedance, return paths, clocks, sensitive analog routing.
- Power/thermal: trace current capacity, copper areas, vias, heat dissipation.
- Manufacturing: footprint/pad geometry, courtyard, mask/paste, assembly orientation, BOM/position consistency.
- Safety: creepage/clearance, isolation, fusing/protection, regulatory constraints.
