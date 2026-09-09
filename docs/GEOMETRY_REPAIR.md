# Conservative MME geometry recovery

The warning describes geometry limitations, not invalid licence/legal status. Analysis of the cached 499-record snapshot from 2026-09-09 found 98 excluded records:

- 91 contain only one or two distinct points per ring. These are now rendered as 89 reference lines and 2 reference points. They cannot define an area. No extra corners, buffer widths or boundary ordering are invented.
- Six contain valid polygon interiors alongside collapsed parts. Retain the known valid areas, preserve original geometry in `source_geometry`, and mark `geometry_partial=true`. These records remain incomplete; overlap measures only the recovered area.
- One contains two individually valid overlapping polygon components. Union those components to represent their combined area without double counting.

On that snapshot, 408 usable original/recovered features plus 91 reference features display all 499 records, with zero records fully excluded. Seven polygons are recovered, six with incomplete parts. Counts may change when the Ministry updates its data.

The recovery path runs only after ordinary coordinate cleanup/validation fails. All original coordinates must be finite and within the Liberia bounds. Valid rings can be closed by repeating their first vertex. Collapsed shells with holes are rejected; self-crossing rings remain rejected. Every retained component and final union must pass the existing validation. No tolerance-based snapping, convex hulls, buffering or guessed vertices are used.

Recovered features retain the original source identifier/properties and `source_geometry`. `geometry_normalization` records transformations, `geometry_repaired` identifies recovery, `geometry_partial` flags missing parts, and `geometry_repair_warning` appears in the licence card. Cache metadata includes recovered/partial counts and a bilingual global coverage warning. Exports preserve these properties.

Both Node and Cloudflare collectors use the same recovery implementation. Deploy the latest backend with `npm run cf:deploy`; Pages rebuilds from GitHub. Existing cloud cache changes on the next successful collection (normally within the six-hour cycle), or a permitted authenticated administrator refresh. Deploying the frontend alone does not reprocess R2 data.

To reconstruct the remaining 91 areas, obtain corrected polygon boundaries or additional authoritative corner coordinates from the Ministry. Their supplied coordinates are shown as purple reference points/dashed lines with a reference-only warning in the licence card. They retain `geometry_reference=true` and original geometry in exports. They do not participate in licence intersection/area checks, so rendering every source record does not imply full area coverage. Multiple collapsed rings are handled independently; mixed point/line components remain quarantined rather than connecting unrelated coordinates.
