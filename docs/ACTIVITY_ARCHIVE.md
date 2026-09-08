# Backend activity archive

Plotting and generating an export now create separate archive events. This includes pasted coordinates, reviewed photo coordinates, imported geometry, GPS, reopening a saved project, project exports and official-dataset downloads. Map redraws and page renders do not create additional events. Existing activity from before this feature cannot be recovered retroactively.

## Files and logs

The default folder is `data/activity/`, or `DATA_DIR/activity` when configured. Set server-side `ACTIVITY_DIR` to override it. Relative paths resolve from the server working directory.

```text
activity/
  events/<event UUID>/
    metadata.json
    geometry.geojson
    plot.kml                 # plot action
    export.kml               # export action: .kml, .kmz, .geojson or .csv
  logs/YYYY-MM-DD.jsonl
```

Each event contains geometry and either a plot KML or the requested export. Metadata includes client and server UTC timestamps, anonymous browser/session IDs, action/source, available project name/input filename, original coordinate text and confirmed CRS where applicable, MME cache timestamp, geometry counts, artifact byte sizes and SHA-256 hashes. Daily logs contain summaries and folder pointers; full input text stays in metadata.

The generated export bytes match the file offered to the browser. An export event records generation/download initiation; it cannot prove the person saved the download to disk. Original photos and original imported binary files are not stored. Anonymous identifiers identify a browser installation/session, not a verified person.

## Read locally

Run from the application folder on the backend machine:

```sh
npm run activity:logs
npm run activity:logs -- --date 2026-09-08 --limit 50 --offset 0
npm run activity:logs -- --date 2026-09-08 --json
npm run activity:logs -- --id EVENT_UUID
```

The default date is today in UTC. Open the referenced event folder to inspect coordinates and files. Browser smoke tests create clearly named `Archive smoke test` and `Archive smoke offline` sample records.

## Protected operator API

Configure a strong server-side `ADMIN_TOKEN` in `.env` and restart to enable authenticated reading. Pass it as an `Authorization: Bearer …` header; never put it in frontend code or a URL.

- `GET /api/admin/activity?date=YYYY-MM-DD&limit=50&offset=0`: daily summaries, newest first, with pagination.
- `GET /api/admin/activity/<event UUID>`: full metadata.
- `GET /api/admin/activity/<event UUID>/files/<filename>`: download an allowlisted artifact.

Unauthenticated reads return 401. Public `POST /api/activity` accepts append-only events and returns a minimal receipt, without exposing stored coordinates or other users' logs. Retrying an identical event ID does not duplicate records; conflicting reuse is rejected. Direct legacy MME download endpoints also save an export before responding.

## Offline behavior and operation

Before plotting or downloading, the browser persists the event in IndexedDB. It uploads immediately when possible, retries while the page is open, and resumes on reconnect/reopen. Settings show pending actions and allow manual retry. An action remains queued until the backend confirms receipt. Closing the page pauses retries; clearing or evicting browser storage before upload can lose pending records. If the browser cannot save the queue, the action reports an error instead of silently proceeding.

The server validates geometry, limits events to 20 MB and 100,000 coordinate positions, and rate-limits ingestion. Invalid/permanently rejected events stay visible in the pending queue. Files are committed together by an atomic directory rename; a retry repairs a failed daily-log update without duplicating the event.

Use persistent storage, keep this directory outside `public`/`dist`, and back it up. No automatic retention/deletion policy is enabled. This filesystem writer is intended for one backend process; multi-replica deployment requires shared transactional storage/coordination. Server records are an operator archive, not a synchronized editable user project library. Both language versions disclose server archiving in the interface.
