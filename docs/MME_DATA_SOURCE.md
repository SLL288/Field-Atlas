# Liberia MME public GIS source

Tested 2026-09-08. This is an independent application.

## Discovery and exact endpoints

Official portal: https://portal.mme.gov.lr/map

Canonical query observed in an unauthenticated Chrome/Playwright network capture:
```
https://repo-prod.revenuedev.org/api/map/geojson/LR/ws/-1?status=Active%20Licenses&type=&owner.id=&minerals.id=
```

Type catalogue loaded by the portal:
```
https://repo-prod.revenuedev.org/api/dictionary/LR/types?onlyName=false
```

Type-filtered public GIS query:
```
https://repo-prod.revenuedev.org/api/map/geojson/LR/ws/-1?status=Active%20Licenses&type=Class%20C%20Mining%20License&owner.id=&minerals.id=
```

The portal also loads a separate application layer:
```
https://repo-prod.revenuedev.org/api/map/geojson/LR/ws/-1?active=true&entity=application
```
Applications are not represented as granted licences in this app.

The active=true&entity=license query found in the portal bundle was tested, but the observed status=Active Licenses query above is canonical. No legacy cadastre endpoint is used. No HTML/pixel scraping is used to obtain GIS geometry. The portal's KML download is login-gated; this application does not access it. Public GeoJSON downloads require no authentication, cookie or private token. A separate register-list query returned "missing token"; it was not pursued.

## Browser observations

- Initial map: public structured FeatureCollection, "Total Records: 500"; Leaflet vector paths.
- Polygon click: licence code, owner, status, type, dates and assets are already in the map feature properties; the popup does not require a new GIS request.
- Licence visibility toggle acts locally.
- Filters expose type, status, owner and assets. Changing the type filter to Class C Mining License and submitting Filter generated the exact filtered query above. The bundle's search function sends status, type, owner.id and minerals.id parameters to the same endpoint.
- See mme-network.json, mme-interactions.json, mme-coverage.json and mme-geometry-report.json.
- scripts/inspect-mme.mjs and scripts/inspect-interactions.mjs reproduce read-only inspection using installed Chrome. They are diagnostic tools, never part of scheduled synchronization.

## Format, layers and CRS

GeoJSON FeatureCollection. Source coordinates are longitude, latitude in WGS84 degrees, matching the portal's direct Leaflet GeoJSON rendering and Liberia bounds. There is no explicit GeoJSON crs member; EPSG:4326 / RFC 7946 axis order is inferred from numeric ranges and the source client. No reprojection is needed for the official dataset.

The public Active Licenses selection includes "Active License" and "Under Review". Preserve those statuses exactly; they do not mean every record is legally active. There are polygon and line geometries. This source is a public mapped subset, not a claim of coverage of every Ministry registry record or every historical status.

## Fields actually present

| Source | Normalized |
|---|---|
| id | id |
| code | license_number |
| type | license_type |
| status | status |
| owner (string) | holder_name |
| assets[].name | commodity (joined names) |
| application_date | application_date |
| start_date | issue_date |
| expiry_date | expiry_date |

All original properties remain in properties.source_data, including type_id, block, color, isLicense and allowOverlap. The source does not supply county, area, a separate company name or a source update timestamp in this map response; these fields are not fabricated. source_url identifies the tested public GIS query. The displayed official link opens the portal map.

## Coverage and pagination

The default response has 500 records. Testing from=500&size=500 returned the same IDs, so these are NOT usable pagination parameters for this endpoint. It is not an ArcGIS FeatureServer.

We independently queried all 59 unique type names from the live dictionary plus names appearing in the default map. The union contains 500 unique source IDs, agreeing with the default map; the largest type partition has 107 records. Filters are substring matches: Class A Mining License also matches its Iron Ore variant. Deduplicate by source ID.

Every sync repeats this coverage check, verifies all initial IDs appear in the partition union, and rejects any partition with 500 or more records or an ignored filter. This avoids silently accepting a potentially truncated response. No claim is made that an undocumented endpoint cannot impose another limit. If the source changes, the cache retains its last known good version pending investigation.

## Source geometry quality

The first validated sync retrieved 500 unique records. 402 were accepted: 387 MultiPolygon and 15 MultiLineString features. 98 were quarantined because their polygon geometry was invalid, including one/two-distinct-position rings and self-intersections.

Turf cleanCoords removes redundant duplicate/collinear positions without moving vertices. 48 features had coordinate normalization attempted; all accepted features subsequently pass coordinate bounds, booleanValid and self-intersection checks. Altered features retain source_geometry and a geometry_normalization note. Invalid records, with original geometry and metadata, remain in the backend cache's quarantined array. They are excluded from public geometry downloads and overlap analysis. A warning on the map, Settings and every overlap result explicitly states incomplete coverage.

See mme-geometry-report.json for excluded IDs and reasons. No polygon boundaries are invented or automatically untangled. An empty update, >30% invalid geometry, >30% loss of previously accepted features, duplicate IDs, invalid coordinates or unverifiable partitions rejects the entire update.

## Central cache and refresh

- A single persistent Node process checks freshness every minute and starts a sync only after six hours; startup checks immediately when stale.
- Public refresh requests only ask this central cache to check freshness; they cannot bypass the six-hour gate.
- Authenticated administrator refresh can bypass the six-hour gate, with a minimum 15-minute interval.
- Upstream calls are sequential, separated by at least 300 ms, with 60-second timeouts and up to three attempts using 2/4-second exponential backoff.
- Per-resource ETag / If-None-Match is used (weak ETags were observed). Last-Modified / If-Modified-Since is supported if ETag is absent. Cached response bodies support 304 replies. SHA-256 hashes the deterministic normalized dataset.
- Disk snapshot swaps use write-to-temp then rename. current.json and last-known-good.json persist data/metadata; a corrupted current snapshot falls back to the valid backup.
- last_checked_at records the attempted check; last_successful_update_at records a successful validation, even if unchanged. content_changed_at changes only with the normalized hash.
- source_url, source_hash, feature_count, source_feature_count, excluded_feature_count and geometry warnings are recorded.
- mme_licenses_latest.kml is generated from normalized geometry. API downloads are generated from one coherent in-memory snapshot.
- Upstream failures never replace the good dataset. The app shows timestamps and the failure warning.
- Device IndexedDB caches the application snapshot; users' phones never request the government API.
- Hosting must keep one Node process running and provide persistent storage. For multiple replicas, replace the filesystem store/scheduler with shared storage and a distributed lock first.
