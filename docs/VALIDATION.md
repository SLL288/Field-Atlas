# Validation — 2026-09-08

Passed:
- npm test: 7 tests covering UTM/DMS/decimal parsing, invalid geometry, spatial intersections, union area, KML escaping, source normalization/quarantine, coverage rejection, refresh throttling, conditional HTTP, last-known-good retention and corrupted-cache recovery. Cache tests use mock upstream HTTP, not government requests.
- npm run build: TypeScript and production Vite/PWA build. Build emits advisory bundle-size warnings; MapLibre is loaded separately on demand.
- scripts/smoke.mjs: actual browser UTM polygon creation, tapping a rendered official vector polygon, licence card, KML download, project save/reopen, licence search, mobile width, offline conversion/export.
- scripts/import-smoke.mjs: KML/KMZ round trips, CSV field mapping, XML entity rejection.
- scripts/ocr-smoke.mjs: generated typed screenshot recognized by Tesseract, detected UTM 29N, mandatory editable review, no automatic geometry creation.
- scripts/pwa-smoke.mjs: service worker control, offline shell reload, IndexedDB MME restoration.
- Real backend KML and GeoJSON endpoints: HTTP 200, non-empty valid downloads.
- Live unauthenticated portal network inspection: initial load, polygon click, visibility toggle, Class C type filtering.

Acceptance input:
341099 806040
341555 806321
341881 805929
UTM 29N, polygon.

Computed user area approximately 13.58 ha, overlap approximately 12.22 ha / 90.0%, with AM2011325 (COSMO INVESTMENT COOPORATION LTD), using the usable source subset cached during this session. This is an engineering test result, not a legal title opinion.

The source returned 500 unique IDs. Validation accepts 402 features (387 MultiPolygon and 15 MultiLineString) and quarantines 98 invalid polygons. Consequently, acceptance steps involving complete current official coverage are limited by source geometry quality, which is disclosed in the application. This test does not certify the underlying Ministry records' legal accuracy or publication freshness.

Not exercised: physical iPhone/Android installation, physical GPS hardware, handwritten OCR accuracy, Docker runtime, hosted HTTPS deployment, multi-replica operation, real payment integrations. Desktop Chrome mobile viewport and browser offline emulation were exercised.

## Follow-up: handwritten-photo workflow and Chinese UI

- npm test: 11 passing tests, including slash-separated coordinate extraction, preservation of unknown digits, absent CRS handling, structured vision request validation, mocked provider errors, and Chinese translation.
- npm run build: passed after adding the bilingual UI and photo workflow.
- scripts/ocr-smoke.mjs: real local printed-image OCR passes through editable rows and requires digit/CRS confirmation.
- scripts/chinese-photo-smoke.mjs: Chinese navigation, slash-based UTM entry, project saving, language persistence, manual photo entry, uncertain-value rejection, mobile layout and confirmation gates passed.
- scripts/smoke.mjs: the existing English mapping/export/offline workflow still passes.
- scripts/chinese-pwa-smoke.mjs: verifies Chinese install metadata, offline shell reload and cached data.
- No real handwriting-model call was made: OPENAI_API_KEY is not configured. The supplied handwritten photo was visually inspected, not passed through a live model; the private review draft contains explicit unknown digits. No geometry was generated from that draft.

## Follow-up: backend plot/export archive

- `npm test`: all 16 tests pass, including archive artifact equality across all four formats, idempotent concurrent retries, conflicting IDs, log repair after partial failure, geometry/size/path validation, anonymous receipts and administrator-only reads/downloads.
- `npm run build`: TypeScript and production/PWA build pass; existing bundle-size advisory remains.
- `scripts/activity-smoke.mjs`: real Chrome online plotting and KMZ download, byte equality with the backend artifact, offline plotting/KML generation, durable pending events across reload, reconnect/manual retry and exactly one daily-log entry per action.
- `npm run activity:logs`: reads actual local sample archive records.

Not exercised: hosted persistent-volume backups, multi-process writers, browser-storage eviction, power failure or automatic retention (not implemented). Offline upload requires the app to be open or reopened with a connection.

## Current-location fix

Location unit tests cover insecure contexts, unsupported browsers, permission denial without repeated prompts, provider fallback, final timeout and invalid coordinates. The Chrome location smoke uses simulated coordinates to verify localhost plotting, coordinate order, archived accuracy and Chinese permission guidance. Physical device location availability remains unverified.

Current-location verification passed: all 20 automated tests, production build and `scripts/location-smoke.mjs`. Browser location was simulated; this does not establish the physical device’s permission/provider state.

## Cloudflare backend adaptation

Includes a Pages service-binding bridge, private backend Worker, R2 files/cache, SQLite Durable Object archive index and serialized writes, and six-hour Cron/alarm refresh. Existing Node OCR shares the same recognition core. Cloud tests use mocked upstream HTTP; live Ministry access from Cloudflare and account deployment remain unverified until the operator signs in and provisions bindings.

Passed: 22 automated tests, frontend production/PWA build, Cloudflare TypeScript check, Worker dry-run bundle, Pages Functions bundle, and local Cloudflare runtime smoke including last-good cache retention after upstream HTTP 403. Dependency audit reports zero known vulnerabilities.

## Workers Free and Node 22 deployment fix — 2026-09-09

Removed the paid CPU override; deployment uses the platform's Free-plan defaults. Node 22 is installed on this Mac but must be selected in the shell. Updated MapLibre to 6.8.0 and its namespace import, and pinned a patched sharp dependency for deployment tooling. Audit: zero known vulnerabilities. Passed all 22 tests, production build, Cloudflare type-check/bundle/runtime smoke, and a production Chrome map/location/KML export check. The older full development smoke timed out waiting for its map canvas against the long-running dev server; restart development after dependency changes. Actual Cloudflare Free CPU/quota enforcement is not simulated locally and remains to be verified after deployment.
