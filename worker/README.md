# ventu-observations (Cloudflare Worker)

Live IPMA + Ecowitt observations for VenTu static site. Forecast data stays on GitHub Pages; this worker only serves `GET /obs?lat=&lon=`.

## Setup

```bash
cd worker
npm install
```

Copy `.dev.vars.example` → `.dev.vars` and fill Ecowitt keys (never commit).

```bash
npm i -g wrangler   # or use npx wrangler
wrangler login
wrangler secret put ECOWITT_APPLICATION_KEY
wrangler secret put ECOWITT_API_KEY
wrangler secret put ECOWITT_MAC
```

## Local dev

```bash
npm run dev
# http://127.0.0.1:8787/obs?lat=41.18&lon=-8.70
```

## Deploy

```bash
npm run deploy
```

Production URL is `https://ventu-observations.busntech-net.workers.dev`. Deploy only from the Cloudflare account that owns that workers.dev subdomain — a login on a different account will create a unused duplicate, not update the live worker.

Note the URL and set `NEXT_PUBLIC_OBS_WORKER_URL` in the site build (GitHub Actions / `.env.local`).

## Verification

| Query | Expected |
|-------|----------|
| `GET /` or `GET /health` | `{ ok: true, service: "ventu-observations" }` |
| `lat=41.18&lon=-8.70` (Matosinhos) | `source: "ecowitt"` |
| `lat=37.10&lon=-8.67` (Algarve) | `source: "ipma"` |
| `lat=39.5&lon=-7.9` (interior) | `observed: null` |

Ecowitt secrets must **only** exist in Wrangler secrets, never in the Next.js repo or `NEXT_PUBLIC_*`.
