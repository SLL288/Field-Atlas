# Field Atlas · Liberia

A React/TypeScript field utility with MapLibre, Turf, proj4, local projects, OCR review, KML/KMZ/GeoJSON/CSV exports and a centralized MME public GIS cache.

## Run locally

Node 20.19+ (Node 22 recommended):
```sh
npm ci
npm run dev
```
Open http://localhost:5173. Vite proxies /api to the Node service on port 3001. First MME synchronization may take several minutes; conversion works while it runs. No private credentials are needed for public data.

## Build and run production

```sh
npm test
npm run build
npm start
```
Open http://localhost:3001. This is a full-stack service: deploying dist alone will not provide MME sync. Set PORT, DATA_DIR (persistent writable directory) and optionally ADMIN_TOKEN on the server. Never prefix secrets with VITE_. No payment credentials are required.

Place the server behind an HTTPS reverse proxy (required for GPS/PWA outside localhost). Run one long-lived process with automatic restart and a persistent data volume. Do not deploy the in-process scheduler to an ephemeral serverless function.

Docker:
```sh
docker build -t field-atlas .
docker run -d --restart unless-stopped -p 3001:3001 -v field-atlas-data:/app/data --name field-atlas field-atlas
```
Terminate HTTPS at your reverse proxy. A Docker image recipe is included; building/running Docker is not required for local development.

Admin refresh: POST /api/admin/mme/refresh with Authorization: Bearer <ADMIN_TOKEN>. Public POST /api/mme/refresh respects the six-hour freshness interval. Admin requests still have a 15-minute upstream cooldown. No administrator token is stored by the frontend.

## Features

- Home, Map, Projects, Settings with mobile controls.
- Coordinate review: decimal latitude/longitude, directional DMS, UTM zone 1–60 N/S, WGS84, names, points/lines/polygons.
- File import: KML, KMZ, WGS84 GeoJSON, CSV, TXT; screenshot/photo OCR always opens editable review.
- GPS position with accuracy metadata.
- MapLibre vector sources, licence click cards, search, type/status/commodity/holder filters, layer visibility.
- Point/line/polygon intersection and polygon area/union overlap percentage.
- KML, KMZ, GeoJSON and vertex-table CSV downloads.
- IndexedDB projects/notes and device-cached official data.
- Central six-hour sync with conditional HTTP, checksum, geometry/coverage checks, quarantine and last-known-good persistence.
- Installable PWA shell and bounded previously viewed OSM tile caching.
- Isolated development entitlement service; all capabilities unlocked.

## Data and important limits

Read [docs/MME_DATA_SOURCE.md](docs/MME_DATA_SOURCE.md) for the exact endpoint, fields, inspection evidence and refresh policy.

On 2026-09-08: 500 unique public source records, 402 usable vector features (387 polygons, 15 lines), 98 invalid source polygons quarantined. The application prominently labels overlap coverage as incomplete. "No overlap" only refers to usable currently loaded records. The public Active Licenses selection includes Under Review. Applications/historical records and absent registry geometries are outside the cached layer.

No county, authoritative area or separate company-name/source-updated fields are invented. Downloaded KML is the validated subset, not all 500 raw records. Source retrieval time is not a Ministry publication date.

The editable project library stays on one browser/device; plot/export actions are additionally archived on the backend. There are no accounts, project-library cloud sync, billing or project photos. Export backups before clearing browser data. CSV export is a vertex table with part/ring identifiers, not a lossless project archive; use GeoJSON/KML for topology. Imported geometry is WGS84. OCR is best with typed screenshots; handwriting is unreliable and always requires review. OCR engine/language files need internet on first use. There is no guaranteed offline basemap beyond visited cached tiles, and browser storage may be evicted.

The Free/Pro boundary is prepared; actual billing, export quotas and store integrations are not enabled. PWA installation can be wrapped with Capacitor later; this repository is not a native store package.

## Validation

```sh
npm test
npm run build
node scripts/smoke.mjs
node scripts/import-smoke.mjs
node scripts/ocr-smoke.mjs
node scripts/pwa-smoke.mjs
```
See [docs/VALIDATION.md](docs/VALIDATION.md) for results and material test limits. The PWA smoke uses the built app served on port 3001.

The smoke script requires running npm run dev and an installed Google Chrome. It exercises UTM polygon creation, exports, projects, mobile layout and offline conversion. Source inspection scripts make public requests and should only be run deliberately, not as automated frequent tests.

## Files

- src/App.tsx, src/Map.tsx, src/style.css: application workflows and map.
- src/io.ts: bounded imports, XML restrictions, exports.
- src/entitlements.ts: billing integration seam.
- shared/geo.ts: transforms, validation, KML, intersections.
- server/source.ts: observed source adapter and coverage/geometry checks.
- server/cache.ts: persistence, conditional HTTP, retries and scheduler gate.
- server/index.ts: API, admin refresh, static production hosting.
- tests/geo.test.ts and scripts/: checks and reproducible source inspection.
- vite.config.ts, public/: PWA and build configuration.
- docs/: data-source documentation and captured evidence.

## Chinese interface and improved photo recognition

Open http://localhost:5173/?lang=zh or use the English / 简体中文 selector.
See [中文使用说明](README.zh-CN.md) and [photo-recognition setup](docs/PHOTO_RECOGNITION.md).
The interface, map controls and warnings are translated; official source values remain intact.
Optional handwriting recognition requires a server-side OPENAI_API_KEY. Without it, local printed-text recognition and side-by-side manual entry work. Photo candidates always require digit and CRS confirmation before mapping.

## Backend plot and export archive

Every successful plot and generated KML, KMZ, GeoJSON or CSV is archived under `data/activity/` by default. Each action has a folder with its geometry, generated file and metadata; daily JSONL logs let the operator review activity. Offline actions wait in a persistent browser queue and upload when the app reconnects or reopens.

```sh
npm run activity:logs
npm run activity:logs -- --date 2026-09-08
npm run activity:logs -- --id EVENT_UUID
```

Use `ACTIVITY_DIR` to change the destination. See [archive operation and access](docs/ACTIVITY_ARCHIVE.md) for folder layout, protected API access and persistence limits.

## Current location

`http://localhost` and `http://127.0.0.1` on the same device support browser location. A phone opening `http://192.168.x.x:5173` requires an HTTPS deployment instead; localhost on the phone means the phone itself. Allow this site's Location permission and enable OS Location Services for the browser. On macOS, check System Settings → Privacy & Security → Location Services. Desktop positioning may depend on Wi-Fi/network services and is not guaranteed to provide GPS accuracy.

The location button explains blocked permissions, insecure origins, missing support and timeouts in both languages. It requests a fresh position, retries without high-accuracy mode if the provider fails, and stores the returned accuracy and timestamp with the plotted point. It cannot bypass browser or OS permissions.

Deploy the Node backend and built frontend together behind HTTPS with persistent `DATA_DIR` storage. Uploading source to GitHub does not deploy a website; GitHub Pages alone cannot run this Express backend, archive files or schedule MME refreshes.

Run `node scripts/location-smoke.mjs` with the dev server running to verify browser location behavior using simulated coordinates.

## Deploy the complete app on Cloudflare

The repository now includes a Cloudflare backend and a Pages API bridge. Follow [Cloudflare setup](docs/CLOUDFLARE.md) to create the private R2 bucket, deploy the Worker and connect the Pages `BACKEND` service binding. This enables MME caching/scheduled refresh, persistent plot/export archives and optional server handwriting without an always-on computer. Existing Node/Docker deployment still works.
