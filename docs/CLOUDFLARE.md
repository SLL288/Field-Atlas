# Cloudflare deployment: existing Pages site + backend Worker

The Pages site stays at `https://field-atlas.pages.dev`. `functions/api/[[path]].ts` forwards `/api/*` to a private backend service binding. The Worker runs API requests and scheduled refreshes; a SQLite Durable Object coordinates writes and indexes activity, and a private R2 bucket holds cache and generated files. No computer needs to remain on.

## Node version troubleshooting on this Mac

Wrangler cannot run under Node 20. This machine already has Homebrew Node 22 installed. Select it in the terminal before running npm/Wrangler commands:

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
node --version
```

This affects the current terminal only. Other machines can install/select Node 22 using their version manager. If deployment never ran, Pages will show the missing BACKEND error until the Worker is deployed, the service binding is added, and Pages is redeployed.

## One-time setup

Use Node.js 22 or newer (`node --version` must show v22 or later) and run these commands from this repository on your computer. Select the same Cloudflare account that owns the Pages project. Enable R2 and keep Workers on the Free plan. The configuration uses the platform defaults and does not request a paid CPU budget. SQLite Durable Objects support Workers Free; large geometry workloads and high traffic remain subject to its limits. R2 has a free allowance with billable overages, so this is not a guaranteed zero-charge service. No resources are created by committing these files.

```sh
git pull --ff-only
npm ci
npx wrangler login
npm run cf:bucket
npm run cf:deploy
```

If `field-atlas-files` already exists in your account, skip the bucket creation command. `cf:deploy` uses `cloudflare/wrangler.jsonc`; it provisions the SQLite Durable Object and installs a Cron Trigger at 00:00, 06:00, 12:00 and 18:00 UTC. The Worker intentionally has no public workers.dev URL. Its traffic comes through your Pages Function service binding.

In Cloudflare dashboard:

1. Open Workers & Pages → your existing **field-atlas Pages project** → Settings → Bindings.
2. Add a **Service binding** with variable name **BACKEND** and service **field-atlas-backend** (production environment if offered).
3. Save, then redeploy the latest Pages commit. Bindings take effect on the new deployment.
4. Keep Pages build command `npm run build`, output `dist`, root blank, and `NODE_VERSION=22`.

Do not put backend secrets in frontend build variables. The Pages project needs only the BACKEND service binding. Preview deployments should remain unbound, or use a separately deployed staging backend/bucket, so preview tests do not write production records.

## Verify

Open `https://field-atlas.pages.dev/api/health`: expect JSON including `"ok":true` and `"storage":"R2 + Durable Object"`.

Open `https://field-atlas.pages.dev/api/mme`: the first request schedules initial collection. Give it a few minutes, then reload. Expect a GeoJSON `data` object and `meta.last_successful_update_at`. Subsequent reads use the centralized cache. The app polls during initial collection. Refresh is gated to once per six hours; authenticated manual refresh has a minimum 15-minute interval. Alarms schedule the next check six hours after each attempt; Cron provides an additional scheduling check. Updates continue without visitors. An upstream failure appears in `meta.error`, preserves the prior dataset and retries on the next eligible refresh. Ministry access from Cloudflare must be verified after deployment; local mock tests do not establish upstream acceptance.

Plot a point, export a file, and wait for the pending backup indicator to clear. In R2 → field-atlas-files, inspect:

```text
mme/current.json
mme/last-known-good.json
mme/resources.json
mme/quarantined.json
activity/events/<event UUID>/geometry.geojson
activity/events/<event UUID>/plot.kml          # or export.kml/kmz/geojson/csv
activity/events/<event UUID>/metadata.json
activity/logs/YYYY-MM-DD/<event UUID>.json
```

R2 folders are object-key prefixes. Cloud activity logs use one JSON per action rather than appending to a daily JSONL file. This avoids concurrent object-storage append loss. The protected API provides a daily paginated list. Local `npm run activity:logs` still reads only local Node archives, not cloud records. Existing local records are not automatically migrated.

## Administrator access and optional handwriting

Set secrets with Wrangler's interactive prompts:

```sh
npx wrangler secret put ADMIN_TOKEN --config cloudflare/wrangler.jsonc
# Optional, only to enable server handwriting recognition:
npx wrangler secret put OPENAI_API_KEY --config cloudflare/wrangler.jsonc
```

Use a strong random ADMIN_TOKEN. Never commit it, put it in a URL, or send it in chat. After configuration, these Pages URLs require `Authorization: Bearer <your token>`:

- GET `/api/admin/activity?date=YYYY-MM-DD&limit=50&offset=0`
- GET `/api/admin/activity/<event UUID>`
- GET `/api/admin/activity/<event UUID>/files/metadata.json` (or an artifact filename)
- POST `/api/admin/mme/refresh`

Without OPENAI_API_KEY, capabilities correctly report server handwriting unavailable; local OCR/manual review remain available. Raw photo bytes are not persisted. R2 public access should stay disabled. Do not set lifecycle deletion rules for this bucket unless intentional; no archive retention/deletion is implemented.

## Subsequent updates and troubleshooting

Pushing GitHub updates rebuilds Pages automatically. Backend changes require running `npm run cf:deploy` again. For automatic backend deployment, create a separate Workers Git build connected to this repository, repository root directory (leave blank), build command `npm ci`, deploy command `npx wrangler deploy --config cloudflare/wrangler.jsonc`; select the existing field-atlas-backend Worker. The CLI path above is the tested setup path.

- `/api/health` returns HTML: deployed Pages commit lacks Functions. Deploy the latest commit.
- JSON says backend not connected: add BACKEND and redeploy Pages.
- MME empty with `meta.error`: investigate the exact upstream/validation error; no source records are invented or bypassed.
- Backups pending: check the binding and R2/Worker health. Reopen Settings and retry after repair. Previously permanently rejected browser events may need manual Retry.
- Inspect Worker logs in the dashboard or with `npx wrangler tail --config cloudflare/wrangler.jsonc`.

The archive uses bounded requests (20 MB / 100,000 coordinates), per-IP request limits, and serialized writes. R2 metadata is written after artifacts and acts as a commit marker; retries repair log/index writes. The Durable Object index and R2 bucket must be retained together. A busy single coordinator can return retryable errors; this initial deployment is not load-tested for high-volume production traffic.

## Validation commands

```sh
npm test
npm run build
npm run cf:check
npx wrangler deploy --config cloudflare/wrangler.jsonc --dry-run --outdir /tmp/field-atlas-worker-build
node scripts/cloudflare-smoke.mjs
npx wrangler pages functions build --outdir /tmp/field-atlas-pages-functions
```

The cloud smoke uses Cloudflare's local runtime, emulated R2/SQLite storage, and mocked MME upstream responses. It exercises concurrent idempotency, export formats, protected reads and scheduled collection. It does not use your Cloudflare account or publish anything.

References: [Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/), [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).
